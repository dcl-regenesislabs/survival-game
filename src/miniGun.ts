import {
  engine,
  Entity,
  Transform,
  GltfContainer,
  Animator
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { ZombieComponent } from './zombie'
import { getProjectileSpawnData, spawnAttachedMuzzleFlashVfx, spawnMuzzleFlashVfx, spawnProjectileEntity } from './gun'
import { getCurrentWeapon } from './weaponManager'
import { getLobbyState, getLocalAddress, isLocalReadyForMatch, sendPlayerShotRequest } from './multiplayer/lobbyClient'
import { getFireRateMultiplier } from './speedEffect'
import { getLocalRotationFromWorld } from './shared/weaponMath'
import { isGameplayFireHeld } from './gameplayInput'
import {
  MINIGUN_HEAT_RECOVERY_SECONDS,
  MINIGUN_OVERHEAT_LOCK_SECONDS,
  MINIGUN_OVERHEAT_SECONDS
} from './shared/matchConfig'
import {
  WEAPON_DEFAULT_ROTATION,
  WEAPON_DEFAULT_SCALE,
  WEAPON_MODEL_VISUAL_OFFSET,
  WEAPON_ROOT_OFFSET
} from './shared/weaponVisuals'

import { getArenaWeaponModelPath, getArenaWeaponShootClip } from './shared/loadoutCatalog'

// Gun config - tweak these to your liking
const ROUNDS_PER_SECOND = 5 // Minigun fires faster
const FIRE_RATE = 1 / ROUNDS_PER_SECOND // Seconds between shots (0.2s = 5 rounds/sec)
const SHOOT_RANGE = 100
const PROJECTILE_SPEED = 20 // Meters per second - lower = slower bullets
const ZOMBIE_TARGET_HEIGHT = 0.9 // Meters above zombie feet to aim at (0.9 = chest level)
// Muzzle position in gun local space (x=right, y=up, z=forward) – matches GLB mesh so bullets spawn at barrel
const MUZZLE_OFFSET_GUN_LOCAL = Vector3.create(0.45, 1.15, 0.58)
// Shorter freeze so rotation can update between shots (minigun fires every 0.2s; 0.4s would block rotation entirely)
const GUN_ROTATION_SMOOTH_SPEED = 14
// Bullet flies straight; remove after this distance from spawn (out of scene)
const BULLET_MAX_DISTANCE = 40
const GUN_SYSTEM_PRIORITY_LAST = -1000

let gunEntity: Entity | null = null
let gunModelEntity: Entity | null = null
let shootTimer = 0
let localShotSeq = 0
let minigunHeatRatio = 0
let minigunOverheatLockRemaining = 0

function coolMinigunHeat(dt: number): void {
  if (minigunHeatRatio <= 0) return
  minigunHeatRatio = Math.max(0, minigunHeatRatio - dt / MINIGUN_HEAT_RECOVERY_SECONDS)
}

function tickMinigunOverheatLock(dt: number): boolean {
  if (minigunOverheatLockRemaining <= 0) return false
  minigunOverheatLockRemaining = Math.max(0, minigunOverheatLockRemaining - dt)
  if (minigunOverheatLockRemaining <= 0) {
    minigunHeatRatio = 0
  } else {
    minigunHeatRatio = 1
  }
  return minigunOverheatLockRemaining > 0
}

export function getMiniGunHeatRatio(): number {
  return minigunHeatRatio
}

export function getMiniGunOverheatCooldownRemaining(): number {
  return minigunOverheatLockRemaining
}

export function isMiniGunOverheated(): boolean {
  return minigunOverheatLockRemaining > 0
}

export function resetMiniGunOverheatState(): void {
  minigunHeatRatio = 0
  minigunOverheatLockRemaining = 0
  shootTimer = 0
}

function getNearestZombie(fromPosition: Vector3): Entity | null {
  let nearest: Entity | null = null
  let nearestDist = SHOOT_RANGE

  for (const [entity, _zombieData, transform] of engine.getEntitiesWith(ZombieComponent, Transform)) {
    const dist = Vector3.distance(fromPosition, transform.position)
    if (dist < nearestDist) {
      nearestDist = dist
      nearest = entity
    }
  }
  return nearest
}

function playGunAnimation() {
  if (gunModelEntity && Animator.has(gunModelEntity)) {
    const animator = Animator.getMutable(gunModelEntity)
    const shootState = animator.states[0]
    if (shootState) {
      for (const s of animator.states) {
        s.playing = s === shootState
        s.loop = false
      }
      shootState.playing = true
      shootState.shouldReset = true
    }
  }
}

function spawnProjectile(
  gunWorldPos: Vector3,
  gunWorldRot: { readonly x: number; readonly y: number; readonly z: number; readonly w: number },
  canDamage: boolean = true,
  weaponType: 'gun' | 'shotgun' | 'minigun' = 'minigun',
  shotSeq: number = 0,
  _shooterAddress: string = ''
): Vector3 {
  const { direction, spawnPos } = getProjectileSpawnData(gunWorldPos, gunWorldRot)
  if (canDamage && gunModelEntity) {
    spawnAttachedMuzzleFlashVfx(gunModelEntity)
  } else if (canDamage && gunEntity) {
    spawnAttachedMuzzleFlashVfx(gunEntity, MUZZLE_OFFSET_GUN_LOCAL)
  } else {
    spawnMuzzleFlashVfx(spawnPos, gunWorldRot)
  }
  spawnProjectileEntity(spawnPos, direction, canDamage, weaponType, shotSeq, 1, PROJECTILE_SPEED)
  return direction
}

export function createMiniGun(upgradeLevel: number = 1): Entity {
  if (gunEntity !== null) return gunEntity

  const gun = engine.addEntity()
  const gunModel = engine.addEntity()
  Transform.create(gun, {
    parent: Transform.has(engine.PlayerEntity) ? engine.PlayerEntity : undefined,
    position: WEAPON_ROOT_OFFSET,
    rotation: WEAPON_DEFAULT_ROTATION,
    scale: WEAPON_DEFAULT_SCALE
  })

  Transform.create(gunModel, {
    parent: gun,
    position: WEAPON_MODEL_VISUAL_OFFSET,
    rotation: WEAPON_DEFAULT_ROTATION,
    scale: WEAPON_DEFAULT_SCALE
  })

  GltfContainer.create(gunModel, {
    src: getArenaWeaponModelPath('minigun', upgradeLevel)
  })

  Animator.create(gunModel, {
    states: [{ clip: getArenaWeaponShootClip('minigun', upgradeLevel), playing: false, loop: false, speed: 1 }]
  })

  gunEntity = gun
  gunModelEntity = gunModel
  return gun
}

export function destroyMiniGun(): void {
  if (gunEntity !== null) {
    engine.removeEntityWithChildren(gunEntity)
    gunEntity = null
    gunModelEntity = null
  }
}

export function miniGunSystem(dt: number) {
  const isOverheatLocked = tickMinigunOverheatLock(dt)
  if (getCurrentWeapon() !== 'minigun' || !Transform.has(engine.PlayerEntity) || !gunEntity) {
    if (!isOverheatLocked) coolMinigunHeat(dt)
    return
  }
  const localAddress = getLocalAddress()
  const lobbyState = getLobbyState()
  const isInArena =
    !!localAddress &&
    !!lobbyState &&
    lobbyState.phase === 'match_created' &&
    lobbyState.arenaPlayers.some((player) => player.address === localAddress) &&
    isLocalReadyForMatch()
  if (!isInArena) {
    if (!isOverheatLocked) coolMinigunHeat(dt)
    return
  }

  const playerTransform = Transform.get(engine.PlayerEntity)
  const gunWorldPos = Vector3.add(
    playerTransform.position,
    Vector3.rotate(WEAPON_ROOT_OFFSET, playerTransform.rotation)
  )
  const visibleGunPos = gunWorldPos

  const nearestZombie = getNearestZombie(visibleGunPos)
  const aimDir = nearestZombie
    ? Vector3.subtract(
        Vector3.create(
          Transform.get(nearestZombie).position.x,
          Transform.get(nearestZombie).position.y + ZOMBIE_TARGET_HEIGHT,
          Transform.get(nearestZombie).position.z
        ),
        visibleGunPos
      )
    : Vector3.rotate(Vector3.Forward(), playerTransform.rotation)
  const aimDirXZ = Vector3.create(aimDir.x, 0, aimDir.z)
  const lenSqXZ = aimDirXZ.x * aimDirXZ.x + aimDirXZ.z * aimDirXZ.z
  let visibleGunRot = Transform.get(gunEntity).rotation

  if (lenSqXZ > 0.001) {
    const desiredWorldRot = Quaternion.lookRotation(Vector3.normalize(aimDirXZ))
    visibleGunRot = desiredWorldRot
    const desiredLocalRot = getLocalRotationFromWorld(playerTransform.rotation, desiredWorldRot)
    const mutableGunTransform = Transform.getMutable(gunEntity)
    const currentLocalRot = Transform.get(gunEntity).rotation
    const rotSmooth = 1 - Math.exp(-GUN_ROTATION_SMOOTH_SPEED * dt)
    mutableGunTransform.rotation = Quaternion.slerp(currentLocalRot, desiredLocalRot, rotSmooth)
    visibleGunRot = Quaternion.multiply(playerTransform.rotation, mutableGunTransform.rotation)
  }

  if (isOverheatLocked) return

  const isTriggerHeld = isGameplayFireHeld()

  if (isTriggerHeld) {
    minigunHeatRatio = Math.min(1, minigunHeatRatio + dt / MINIGUN_OVERHEAT_SECONDS)
    if (minigunHeatRatio >= 1) {
      minigunHeatRatio = 1
      minigunOverheatLockRemaining = MINIGUN_OVERHEAT_LOCK_SECONDS
      shootTimer = 0
      return
    }
  } else {
    coolMinigunHeat(dt)
  }

  const effectiveFireRate = FIRE_RATE / getFireRateMultiplier()
  shootTimer += dt
  if (shootTimer < effectiveFireRate) return

  if (!isTriggerHeld) return

  shootTimer = 0
  playGunAnimation()
  const nextShotSeq = localShotSeq + 1
  const direction = spawnProjectile(visibleGunPos, visibleGunRot, true, 'minigun', nextShotSeq, getLocalAddress() ?? '')
  localShotSeq = nextShotSeq
  sendPlayerShotRequest('minigun', visibleGunPos, direction, localShotSeq)
}

export function spawnReplicatedMiniGunShotVisual(origin: Vector3, direction: Vector3, shooterAddress: string = ''): void {
  const directionXZ = Vector3.create(direction.x, 0, direction.z)
  const lenSq = directionXZ.x * directionXZ.x + directionXZ.z * directionXZ.z
  if (lenSq <= 0.0001) return
  const rotation = Quaternion.lookRotation(Vector3.normalize(directionXZ))
  spawnProjectile(origin, rotation, false, 'minigun', 0, shooterAddress)
}

export function initMiniGunSystems() {
  engine.addSystem(miniGunSystem, GUN_SYSTEM_PRIORITY_LAST, 'miniGunSystem')
}
