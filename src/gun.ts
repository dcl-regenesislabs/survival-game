import {
  engine,
  Entity,
  Transform,
  GltfContainer,
  Animator,
  Schemas
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { ZombieComponent, damageZombie, getGameTime } from './zombie'
import { getCurrentWeapon } from './weaponManager'
import { getLobbyState, getLocalAddress, isLocalReadyForMatch, sendPlayerShotRequest } from './multiplayer/lobbyClient'
import { getFireRateMultiplier } from './speedEffect'
import { getLocalRotationFromWorld } from './shared/weaponMath'
import { isGameplayFireHeld, isIsoViewEnabled } from './gameplayInput'
import { isPlayerDead } from './playerHealth'
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
const SHOOT_RANGE = 15
const PROJECTILE_SPEED = 28 // Faster bullets make auto-aim feel more responsive
const ZOMBIE_TARGET_HEIGHT = 0.9 // Meters above zombie feet to aim at (0.9 = chest level)
const BULLET_MODEL_SRC = 'assets/scene/Models/bullets/Bullet.glb'
const MUZZLE_FLASH_MODEL_SRC = 'assets/scene/Models/bullets/GunVFX.glb'
const MUZZLE_FLASH_CLIP = 'GunShotVFX01'
const MUZZLE_FLASH_DURATION = 0.25
// Muzzle position in gun local space (x=right, y=up, z=forward) – matches GLB mesh so bullets spawn at barrel
const MUZZLE_OFFSET_GUN_LOCAL = Vector3.create(0.45, 1.15, 0.58)
const MUZZLE_FLASH_OFFSET_MODEL_LOCAL = Vector3.create(0, 0, -0.08)
// How long to freeze gun rotation after shooting (so bullet spawn looks correct). Tweak to match your shoot clip length.
const GUN_ROTATION_SMOOTH_SPEED = 20
// Bullet flies straight; remove after this distance from spawn (out of scene)
const BULLET_MAX_DISTANCE = 15
const PROJECTILE_COLLIDER_SCALE_VALUE = 0.18
const PROJECTILE_COLLIDER_SCALE = Vector3.create(
  PROJECTILE_COLLIDER_SCALE_VALUE,
  PROJECTILE_COLLIDER_SCALE_VALUE,
  PROJECTILE_COLLIDER_SCALE_VALUE
)
// Keep the gameplay collider small while rendering the GLB at a readable size.
const PROJECTILE_VISUAL_LOCAL_SCALE_VALUE = 1 / PROJECTILE_COLLIDER_SCALE_VALUE
const PROJECTILE_VISUAL_SHRINK_DISTANCE = 6
const GUN_SYSTEM_PRIORITY_LAST = -1000
const PROJECTILE_HIT_RADIUS = 1.15
const PROJECTILE_HIT_RADIUS_SQ = PROJECTILE_HIT_RADIUS * PROJECTILE_HIT_RADIUS
const HIDDEN_POOL_POSITION = Vector3.create(0, -1000, 0)
const PROJECTILE_POOL_PREWARM_COUNT = 24
const WORLD_MUZZLE_FLASH_POOL_PREWARM_COUNT = 12

// Per-tier gun upgrade stats (matches UI display in lobbyStoreUi.tsx WEAPON_STATS)
const GUN_UPGRADE_STATS: Record<number, { damage: number; fireRate: number }> = {
  1: { damage: 1, fireRate: 0.44 },
  2: { damage: 1, fireRate: 0.38 },
  3: { damage: 2, fireRate: 0.33 }
}

// Projectile: flies straight; hit detection uses cheap distance checks in projectileSystem.
const ProjectileComponentSchema = {
  active: Schemas.Boolean,
  direction: Schemas.Vector3,
  startPosition: Schemas.Vector3,
  visualEntity: Schemas.Entity,
  canDamage: Schemas.Boolean,
  weaponType: Schemas.String,
  shotSeq: Schemas.Number,
  speed: Schemas.Number,
  maxDistance: Schemas.Number,
  damage: Schemas.Number
}
export const ProjectileComponent = engine.defineComponent('ProjectileComponent', ProjectileComponentSchema)
const ProjectileMuzzleFlashComponent = engine.defineComponent('ProjectileMuzzleFlashComponent', {
  active: Schemas.Boolean,
  attached: Schemas.Boolean,
  endTime: Schemas.Number
})

let gunEntity: Entity | null = null
let gunModelEntity: Entity | null = null
let shootTimer = 0
let localShotSeq = 0
let currentGunUpgradeLevel = 1
let projectilePoolInitialized = false
let worldMuzzleFlashPoolInitialized = false
const projectilePool: Entity[] = []
const worldMuzzleFlashPool: Entity[] = []
const attachedMuzzleFlashByWeapon = new Map<Entity, Entity>()

function isLocalPlayerInArena(): boolean {
  if (isPlayerDead()) return false
  const localAddress = getLocalAddress()
  const lobbyState = getLobbyState()
  return (
    !!localAddress &&
    !!lobbyState &&
    lobbyState.phase === 'match_created' &&
    lobbyState.arenaPlayers.some((player) => player.address === localAddress) &&
    isLocalReadyForMatch()
  )
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

type WeaponProjectileType = 'gun' | 'shotgun' | 'minigun'
type RotationLike = { readonly x: number; readonly y: number; readonly z: number; readonly w: number }

export function getProjectileSpawnData(gunWorldPos: Vector3, gunWorldRot: RotationLike) {
  const direction = Vector3.normalize(Vector3.rotate(Vector3.Forward(), gunWorldRot))
  const right = Vector3.rotate(Vector3.Right(), gunWorldRot)
  const up = Vector3.rotate(Vector3.Up(), gunWorldRot)
  const offset = Vector3.add(
    Vector3.add(
      Vector3.scale(right, MUZZLE_OFFSET_GUN_LOCAL.x),
      Vector3.scale(up, MUZZLE_OFFSET_GUN_LOCAL.y)
    ),
    Vector3.scale(direction, MUZZLE_OFFSET_GUN_LOCAL.z)
  )

  return {
    direction,
    right,
    up,
    spawnPos: Vector3.add(gunWorldPos, offset)
  }
}

function restartSingleClipAnimation(entity: Entity): void {
  if (!Animator.has(entity)) return
  const animator = Animator.getMutable(entity)
  const state = animator.states[0]
  if (!state) return
  for (const currentState of animator.states) {
    currentState.playing = currentState === state
    currentState.loop = false
  }
  state.playing = true
  state.shouldReset = true
}

function createPooledProjectileEntity(): Entity {
  const projectile = engine.addEntity()
  Transform.create(projectile, {
    position: HIDDEN_POOL_POSITION,
    rotation: Quaternion.Identity(),
    scale: Vector3.Zero()
  })

  const projectileVisual = engine.addEntity()
  Transform.create(projectileVisual, {
    parent: projectile,
    position: Vector3.Zero(),
    rotation: Quaternion.Identity(),
    scale: Vector3.Zero()
  })
  GltfContainer.create(projectileVisual, {
    src: BULLET_MODEL_SRC,
    visibleMeshesCollisionMask: 0,
    invisibleMeshesCollisionMask: 0
  })

  ProjectileComponent.create(projectile, {
    active: false,
    direction: Vector3.Forward(),
    startPosition: HIDDEN_POOL_POSITION,
    visualEntity: projectileVisual,
    canDamage: false,
    weaponType: 'gun',
    shotSeq: 0,
    speed: PROJECTILE_SPEED,
    maxDistance: BULLET_MAX_DISTANCE,
    damage: 0
  })

  projectilePool.push(projectile)
  return projectile
}

function ensureProjectilePool(): void {
  if (projectilePoolInitialized) return
  projectilePoolInitialized = true
  for (let i = 0; i < PROJECTILE_POOL_PREWARM_COUNT; i += 1) {
    createPooledProjectileEntity()
  }
}

function acquireProjectileEntity(): Entity {
  ensureProjectilePool()
  for (const entity of projectilePool) {
    if (!ProjectileComponent.has(entity)) continue
    if (!ProjectileComponent.get(entity).active) return entity
  }
  return createPooledProjectileEntity()
}

function deactivateProjectileEntity(projectile: Entity): void {
  if (!ProjectileComponent.has(projectile) || !Transform.has(projectile)) return

  const projectileData = ProjectileComponent.get(projectile)
  const mutableProjectile = ProjectileComponent.getMutable(projectile)
  mutableProjectile.active = false
  mutableProjectile.canDamage = false
  mutableProjectile.damage = 0
  mutableProjectile.shotSeq = 0

  const transform = Transform.getMutable(projectile)
  transform.position = HIDDEN_POOL_POSITION
  transform.rotation = Quaternion.Identity()
  transform.scale = Vector3.Zero()

  if (!Transform.has(projectileData.visualEntity)) return
  const visualTransform = Transform.getMutable(projectileData.visualEntity)
  visualTransform.position = Vector3.Zero()
  visualTransform.rotation = Quaternion.Identity()
  visualTransform.scale = Vector3.Zero()
}

function createWorldMuzzleFlashEntity(): Entity {
  const muzzleFlash = engine.addEntity()
  Transform.create(muzzleFlash, {
    position: HIDDEN_POOL_POSITION,
    rotation: Quaternion.Identity(),
    scale: Vector3.Zero()
  })
  GltfContainer.create(muzzleFlash, {
    src: MUZZLE_FLASH_MODEL_SRC,
    visibleMeshesCollisionMask: 0,
    invisibleMeshesCollisionMask: 0
  })
  Animator.create(muzzleFlash, {
    states: [{ clip: MUZZLE_FLASH_CLIP, playing: false, loop: false, speed: 1 }]
  })
  ProjectileMuzzleFlashComponent.create(muzzleFlash, {
    active: false,
    attached: false,
    endTime: 0
  })
  worldMuzzleFlashPool.push(muzzleFlash)
  return muzzleFlash
}

function ensureWorldMuzzleFlashPool(): void {
  if (worldMuzzleFlashPoolInitialized) return
  worldMuzzleFlashPoolInitialized = true
  for (let i = 0; i < WORLD_MUZZLE_FLASH_POOL_PREWARM_COUNT; i += 1) {
    createWorldMuzzleFlashEntity()
  }
}

function acquireWorldMuzzleFlashEntity(): Entity {
  ensureWorldMuzzleFlashPool()
  for (const entity of worldMuzzleFlashPool) {
    if (!ProjectileMuzzleFlashComponent.has(entity)) continue
    if (!ProjectileMuzzleFlashComponent.get(entity).active) return entity
  }
  return createWorldMuzzleFlashEntity()
}

function createAttachedMuzzleFlashEntity(weaponEntity: Entity): Entity {
  const muzzleFlash = engine.addEntity()
  Transform.create(muzzleFlash, {
    parent: weaponEntity,
    position: MUZZLE_FLASH_OFFSET_MODEL_LOCAL,
    rotation: Quaternion.Identity(),
    scale: Vector3.Zero()
  })
  GltfContainer.create(muzzleFlash, {
    src: MUZZLE_FLASH_MODEL_SRC,
    visibleMeshesCollisionMask: 0,
    invisibleMeshesCollisionMask: 0
  })
  Animator.create(muzzleFlash, {
    states: [{ clip: MUZZLE_FLASH_CLIP, playing: false, loop: false, speed: 1 }]
  })
  ProjectileMuzzleFlashComponent.create(muzzleFlash, {
    active: false,
    attached: true,
    endTime: 0
  })
  attachedMuzzleFlashByWeapon.set(weaponEntity, muzzleFlash)
  return muzzleFlash
}

function getOrCreateAttachedMuzzleFlashEntity(weaponEntity: Entity): Entity {
  const existing = attachedMuzzleFlashByWeapon.get(weaponEntity)
  if (existing && Transform.has(existing) && ProjectileMuzzleFlashComponent.has(existing)) {
    return existing
  }
  return createAttachedMuzzleFlashEntity(weaponEntity)
}

function activateMuzzleFlash(entity: Entity, attached: boolean, endTime: number): void {
  if (!ProjectileMuzzleFlashComponent.has(entity)) return
  const mutableFlash = ProjectileMuzzleFlashComponent.getMutable(entity)
  mutableFlash.active = true
  mutableFlash.attached = attached
  mutableFlash.endTime = endTime
  restartSingleClipAnimation(entity)
}

export function spawnMuzzleFlashVfx(spawnPos: Vector3, gunWorldRot: RotationLike): void {
  const muzzleFlash = acquireWorldMuzzleFlashEntity()
  const transform = Transform.getMutable(muzzleFlash)
  transform.position = Vector3.clone(spawnPos)
  transform.rotation = gunWorldRot
  transform.scale = Vector3.One()
  activateMuzzleFlash(muzzleFlash, false, getGameTime() + MUZZLE_FLASH_DURATION)
}

export function spawnAttachedMuzzleFlashVfx(
  weaponEntity: Entity,
  localPosition: Vector3 = MUZZLE_FLASH_OFFSET_MODEL_LOCAL
): void {
  const muzzleFlash = getOrCreateAttachedMuzzleFlashEntity(weaponEntity)
  const transform = Transform.getMutable(muzzleFlash)
  transform.position = localPosition
  transform.rotation = Quaternion.Identity()
  transform.scale = Vector3.One()
  activateMuzzleFlash(muzzleFlash, true, getGameTime() + MUZZLE_FLASH_DURATION)
}

export function spawnProjectileEntity(
  spawnPos: Vector3,
  direction: Vector3,
  canDamage: boolean,
  weaponType: WeaponProjectileType,
  shotSeq: number,
  damage: number = 1,
  speed: number = PROJECTILE_SPEED,
  maxDistance: number = BULLET_MAX_DISTANCE
): Entity {
  const projectile = acquireProjectileEntity()
  const projectileData = ProjectileComponent.get(projectile)
  const transform = Transform.getMutable(projectile)
  transform.position = Vector3.clone(spawnPos)
  transform.rotation = Quaternion.lookRotation(direction)
  transform.scale = PROJECTILE_COLLIDER_SCALE

  const mutableProjectile = ProjectileComponent.getMutable(projectile)
  mutableProjectile.active = true
  mutableProjectile.direction = direction
  mutableProjectile.startPosition = Vector3.clone(spawnPos)
  mutableProjectile.canDamage = canDamage
  mutableProjectile.weaponType = weaponType
  mutableProjectile.shotSeq = shotSeq
  mutableProjectile.speed = speed
  mutableProjectile.maxDistance = maxDistance
  mutableProjectile.damage = damage

  if (Transform.has(projectileData.visualEntity)) {
    const visualTransform = Transform.getMutable(projectileData.visualEntity)
    visualTransform.position = Vector3.Zero()
    visualTransform.rotation = Quaternion.Identity()
    visualTransform.scale = Vector3.create(
      PROJECTILE_VISUAL_LOCAL_SCALE_VALUE,
      PROJECTILE_VISUAL_LOCAL_SCALE_VALUE,
      PROJECTILE_VISUAL_LOCAL_SCALE_VALUE
    )
  }
  return projectile
}

function getProjectileVisualScaleFactor(traveled: number, maxDistance: number): number {
  const shrinkStartDistance = Math.max(2.5, maxDistance - PROJECTILE_VISUAL_SHRINK_DISTANCE)
  if (traveled <= shrinkStartDistance) return 1
  const shrinkT = Math.min(
    1,
    (traveled - shrinkStartDistance) /
      Math.max(0.01, maxDistance - shrinkStartDistance)
  )
  return 1 - shrinkT
}

function spawnProjectile(
  gunWorldPos: Vector3,
  gunWorldRot: RotationLike,
  canDamage: boolean = true,
  weaponType: WeaponProjectileType = 'gun',
  shotSeq: number = 0,
  _shooterAddress: string = '',
  damage: number = 1,
  attachFlashToWeapon: boolean = canDamage
): Vector3 {
  const { direction, spawnPos } = getProjectileSpawnData(gunWorldPos, gunWorldRot)
  if (attachFlashToWeapon && gunModelEntity) {
    spawnAttachedMuzzleFlashVfx(gunModelEntity)
  } else if (attachFlashToWeapon && gunEntity) {
    spawnAttachedMuzzleFlashVfx(gunEntity, MUZZLE_OFFSET_GUN_LOCAL)
  } else {
    spawnMuzzleFlashVfx(spawnPos, gunWorldRot)
  }
  spawnProjectileEntity(spawnPos, direction, canDamage, weaponType, shotSeq, damage, PROJECTILE_SPEED, BULLET_MAX_DISTANCE)
  return direction
}

export function createGun(upgradeLevel: number = 1): Entity {
  if (gunEntity !== null) return gunEntity
  currentGunUpgradeLevel = Math.max(1, Math.min(3, upgradeLevel))

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
    src: getArenaWeaponModelPath('gun', upgradeLevel)
  })

  Animator.create(gunModel, {
    states: [{ clip: getArenaWeaponShootClip('gun', currentGunUpgradeLevel), playing: false, loop: false, speed: 1 }]
  })

  gunEntity = gun
  gunModelEntity = gunModel
  return gun
}

export function destroyGun(): void {
  if (gunEntity !== null) {
    unregisterAttachedMuzzleFlash(gunEntity)
    if (gunModelEntity !== null) unregisterAttachedMuzzleFlash(gunModelEntity)
    engine.removeEntityWithChildren(gunEntity)
    gunEntity = null
    gunModelEntity = null
    currentGunUpgradeLevel = 1
  }
}

export function unregisterAttachedMuzzleFlash(weaponEntity: Entity): void {
  attachedMuzzleFlashByWeapon.delete(weaponEntity)
}

function projectileSystem(dt: number) {
  for (const [projectile, projData, transform] of engine.getEntitiesWith(
    ProjectileComponent,
    Transform
  )) {
    if (!projData.active) continue

    const currentPos = transform.position
    const dir = projData.direction
    const startPos = projData.startPosition

    // Move bullet straight; hit detection is resolved with squared-distance checks.
    const bulletSpeed = projData.speed > 0 ? projData.speed : PROJECTILE_SPEED
    const newPos = Vector3.add(currentPos, Vector3.scale(dir, bulletSpeed * dt))

    // Remove if bullet went out of range (out of scene)
    const traveled = Vector3.distance(newPos, startPos)
    const maxDistance = projData.maxDistance > 0 ? projData.maxDistance : BULLET_MAX_DISTANCE
    if (traveled > maxDistance) {
      deactivateProjectileEntity(projectile)
      continue
    }

    const mutableTransform = Transform.getMutable(projectile)
    mutableTransform.position = newPos

    if (Transform.has(projData.visualEntity)) {
      const scaleFactor = getProjectileVisualScaleFactor(traveled, maxDistance)
      const visualScale = Math.max(0, PROJECTILE_VISUAL_LOCAL_SCALE_VALUE * scaleFactor)
      const visualTransform = Transform.getMutable(projData.visualEntity)
      visualTransform.scale = Vector3.create(visualScale, visualScale, visualScale)
    }

    if (!projData.canDamage) continue

    for (const [zombie] of engine.getEntitiesWith(ZombieComponent, Transform)) {
      const zombiePos = Transform.get(zombie).position
      const dx = newPos.x - zombiePos.x
      const dy = newPos.y - (zombiePos.y + ZOMBIE_TARGET_HEIGHT)
      const dz = newPos.z - zombiePos.z
      const distSq = dx * dx + dy * dy + dz * dz
      if (distSq > PROJECTILE_HIT_RADIUS_SQ) continue

      damageZombie(zombie, projData.damage > 0 ? projData.damage : 1, { weaponType: projData.weaponType as 'gun' | 'shotgun' | 'minigun', shotSeq: Math.floor(projData.shotSeq) })
      deactivateProjectileEntity(projectile)
      break
    }
  }
}

function projectileMuzzleFlashSystem(): void {
  const now = getGameTime()
  for (const [entity, muzzleFlash] of engine.getEntitiesWith(ProjectileMuzzleFlashComponent, Transform)) {
    if (!muzzleFlash.active) continue
    if (now < muzzleFlash.endTime) continue

    const mutableFlash = ProjectileMuzzleFlashComponent.getMutable(entity)
    mutableFlash.active = false

    const transform = Transform.getMutable(entity)
    transform.scale = Vector3.Zero()
    if (!muzzleFlash.attached) {
      transform.position = HIDDEN_POOL_POSITION
      transform.rotation = Quaternion.Identity()
    }
  }
}

export function gunSystem(dt: number) {
  if (!Transform.has(engine.PlayerEntity)) return

  const isInArena = isLocalPlayerInArena()
  const shouldTrackGun = !isPlayerDead() && isInArena && getCurrentWeapon() === 'gun'

  if (!shouldTrackGun) {
    if (gunEntity) destroyGun()
    return
  }

  if (!gunEntity) {
    createGun()
  }

  if (!gunEntity) return

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

  const upgradeStats = GUN_UPGRADE_STATS[currentGunUpgradeLevel] ?? GUN_UPGRADE_STATS[1]
  const effectiveFireRate = upgradeStats.fireRate / getFireRateMultiplier()
  shootTimer += dt
  if (shootTimer < effectiveFireRate) return

  const isTriggerHeld = isGameplayFireHeld()
  if (!isTriggerHeld) return
  if (!nearestZombie) return

  shootTimer = 0
  playGunAnimation()

  const nextShotSeq = localShotSeq + 1
  const direction = spawnProjectile(visibleGunPos, visibleGunRot, true, 'gun', nextShotSeq, getLocalAddress() ?? '', upgradeStats.damage)
  localShotSeq = nextShotSeq
  sendPlayerShotRequest('gun', visibleGunPos, direction, localShotSeq)
}

export function spawnReplicatedGunShotVisual(origin: Vector3, direction: Vector3, shooterAddress: string = ''): void {
  const directionXZ = Vector3.create(direction.x, 0, direction.z)
  const lenSq = directionXZ.x * directionXZ.x + directionXZ.z * directionXZ.z
  if (lenSq <= 0.0001) return
  const rotation = Quaternion.lookRotation(Vector3.normalize(directionXZ))
  spawnProjectile(origin, rotation, false, 'gun', 0, shooterAddress)
}

export function initGunSystems() {
  ensureProjectilePool()
  ensureWorldMuzzleFlashPool()
  engine.addSystem(projectileSystem)
  engine.addSystem(projectileMuzzleFlashSystem)
  engine.addSystem(gunSystem, GUN_SYSTEM_PRIORITY_LAST, 'gunSystem')
}
