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
  WEAPON_DEFAULT_ROTATION,
  WEAPON_DEFAULT_SCALE,
  WEAPON_MODEL_VISUAL_OFFSET,
  WEAPON_ROOT_OFFSET
} from './shared/weaponVisuals'

import { getArenaWeaponModelPath, getArenaWeaponShootClip } from './shared/loadoutCatalog'

// Gun config - tweak these to your liking
const ROUNDS_PER_SECOND = 2 // Manual fire rate: 1 shot every 0.5s
const FIRE_RATE = 1 / ROUNDS_PER_SECOND // Seconds between shots (derived)
const SHOOT_RANGE = 100
const PROJECTILE_SPEED = 20 // Meters per second - lower = slower bullets
const ZOMBIE_TARGET_HEIGHT = 0.9 // Meters above zombie feet to aim at (0.9 = chest level)
// Muzzle position in gun local space (x=right, y=up, z=forward) – matches GLB mesh so bullets spawn at barrel
const MUZZLE_OFFSET_GUN_LOCAL = Vector3.create(0.45, 1.15, 0.58)
// How long to freeze gun rotation after shooting (so bullet spawn looks correct). Tweak to match your shoot clip length.
const GUN_ROTATION_SMOOTH_SPEED = 14
// Bullet flies straight; remove after this distance from spawn (out of scene)
const BULLET_MAX_DISTANCE = 40
const GUN_SYSTEM_PRIORITY_LAST = -1000

let gunEntity: Entity | null = null
let gunModelEntity: Entity | null = null
let shootTimer = 0
let localShotSeq = 0

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

const SHOTGUN_SPREAD_DEG = 5 // +5° and -5° from center for the side pellets
const SHOTGUN_SPREAD_TAN = Math.tan((SHOTGUN_SPREAD_DEG * Math.PI) / 180)

function spawnProjectile(
  gunWorldPos: Vector3,
  gunWorldRot: { readonly x: number; readonly y: number; readonly z: number; readonly w: number },
  canDamage: boolean = true,
  weaponType: 'gun' | 'shotgun' | 'minigun' = 'shotgun',
  shotSeq: number = 0,
  _shooterAddress: string = ''
): Vector3 {
  const { direction: baseDirection, right, spawnPos } = getProjectileSpawnData(gunWorldPos, gunWorldRot)
  if (canDamage && gunModelEntity) {
    spawnAttachedMuzzleFlashVfx(gunModelEntity)
  } else if (canDamage && gunEntity) {
    spawnAttachedMuzzleFlashVfx(gunEntity, MUZZLE_OFFSET_GUN_LOCAL)
  } else {
    spawnMuzzleFlashVfx(spawnPos, gunWorldRot)
  }

  // Center, left (+right), right (-right) - each bullet follows its own straight line
  const directions = [
    baseDirection,
    Vector3.normalize(Vector3.add(baseDirection, Vector3.scale(right, SHOTGUN_SPREAD_TAN))),
    Vector3.normalize(Vector3.subtract(baseDirection, Vector3.scale(right, SHOTGUN_SPREAD_TAN)))
  ]

  for (const direction of directions) {
    spawnProjectileEntity(spawnPos, direction, canDamage, weaponType, shotSeq, 1, PROJECTILE_SPEED)
  }
  return baseDirection
}

export function createShotGun(upgradeLevel: number = 1): Entity {
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
    src: getArenaWeaponModelPath('shotgun', upgradeLevel)
  })

  Animator.create(gunModel, {
    states: [{ clip: getArenaWeaponShootClip('shotgun', upgradeLevel), playing: false, loop: false, speed: 1 }]
  })

  gunEntity = gun
  gunModelEntity = gunModel
  return gun
}

export function destroyShotGun(): void {
  if (gunEntity !== null) {
    engine.removeEntityWithChildren(gunEntity)
    gunEntity = null
    gunModelEntity = null
  }
}

export function shotGunSystem(dt: number) {
  if (getCurrentWeapon() !== 'shotgun' || !Transform.has(engine.PlayerEntity) || !gunEntity) return
  const localAddress = getLocalAddress()
  const lobbyState = getLobbyState()
  const isInArena =
    !!localAddress &&
    !!lobbyState &&
    lobbyState.phase === 'match_created' &&
    lobbyState.arenaPlayers.some((player) => player.address === localAddress) &&
    isLocalReadyForMatch()
  if (!isInArena) return

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

  const effectiveFireRate = FIRE_RATE / getFireRateMultiplier()
  shootTimer += dt
  if (shootTimer < effectiveFireRate) return

  const isTriggerHeld = isGameplayFireHeld()
  if (!isTriggerHeld) return

  shootTimer = 0
  playGunAnimation()
  const nextShotSeq = localShotSeq + 1
  const direction = spawnProjectile(visibleGunPos, visibleGunRot, true, 'shotgun', nextShotSeq, getLocalAddress() ?? '')
  localShotSeq = nextShotSeq
  sendPlayerShotRequest('shotgun', visibleGunPos, direction, localShotSeq)
}

export function spawnReplicatedShotGunShotVisual(origin: Vector3, direction: Vector3, shooterAddress: string = ''): void {
  const directionXZ = Vector3.create(direction.x, 0, direction.z)
  const lenSq = directionXZ.x * directionXZ.x + directionXZ.z * directionXZ.z
  if (lenSq <= 0.0001) return
  const rotation = Quaternion.lookRotation(Vector3.normalize(directionXZ))
  spawnProjectile(origin, rotation, false, 'shotgun', 0, shooterAddress)
}

export function initShotGunSystems() {
  engine.addSystem(shotGunSystem, GUN_SYSTEM_PRIORITY_LAST, 'shotGunSystem')
}
