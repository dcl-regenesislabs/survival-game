import {
  engine,
  Entity,
  Transform,
  inputSystem,
  InputAction,
  PointerEventType,
  GltfContainer,
  Animator,
  MeshRenderer,
  Material,
  Schemas
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4, Color3 } from '@dcl/sdk/math'
import { ZombieComponent, damageZombie } from './zombie'
import { getCurrentWeapon } from './weaponManager'
import { getFireRateMultiplier } from './rageEffect'
import { getLobbyState, getLocalAddress, isLocalReadyForMatch, sendPlayerShotRequest } from './multiplayer/lobbyClient'

const GUN_MODEL = 'assets/scene/Models/drones/gun/DroneGun.glb'
const DEBUG_SHOW_GUN_IN_LOBBY = false
const GUN_MODEL_VISUAL_OFFSET = Vector3.create(0.45, 1.15, 0.35)

const GUN_SHOOT_ANIM = 'DroneGunShoot'

// Gun config - tweak these to your liking
const GUN_OFFSET = Vector3.create(0.18, 0, 0) // Local offset from player (right, up, forward)
const ROUNDS_PER_SECOND = 2 // Manual fire rate: 1 shot every 0.5s
const FIRE_RATE = 1 / ROUNDS_PER_SECOND // Seconds between shots (derived)
const SHOOT_RANGE = 100
const PROJECTILE_SPEED = 10 // Meters per second - lower = slower bullets
const ZOMBIE_TARGET_HEIGHT = 0.9 // Meters above zombie feet to aim at (0.9 = chest level)
// Muzzle position in gun local space (x=right, y=up, z=forward) – matches GLB mesh so bullets spawn at barrel
const MUZZLE_OFFSET_GUN_LOCAL = Vector3.create(0.45, 1.15, 0.58)
// How long to freeze gun rotation after shooting (so bullet spawn looks correct). Tweak to match your shoot clip length.
const SHOOT_ANIM_FREEZE_DURATION = 0
const GUN_ROTATION_SMOOTH_SPEED = 14
// Bullet flies straight; remove after this distance from spawn (out of scene)
const BULLET_MAX_DISTANCE = 40
const GUN_SYSTEM_PRIORITY_LAST = -1000
const PROJECTILE_HIT_RADIUS = 0.95
const PROJECTILE_HIT_RADIUS_SQ = PROJECTILE_HIT_RADIUS * PROJECTILE_HIT_RADIUS

// Projectile: flies straight; hit detection is via TriggerArea on zombies (collider-based)
const ProjectileComponentSchema = {
  direction: Schemas.Vector3,
  startPosition: Schemas.Vector3,
  canDamage: Schemas.Boolean,
  weaponType: Schemas.String,
  shotSeq: Schemas.Number
}
export const ProjectileComponent = engine.defineComponent('ProjectileComponent', ProjectileComponentSchema)

let gunEntity: Entity | null = null
let gunModelEntity: Entity | null = null
let shootTimer = 0
/** Seconds left to freeze gun rotation after shoot (animator.playing may not clear when clip ends) */
let rotationFreezeRemaining = 0
let localShotSeq = 0

function isLocalPlayerInArena(): boolean {
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

function getLocalRotationFromWorld(parentRotation: Quaternion, worldRotation: Quaternion): Quaternion {
  return Quaternion.multiply(
    Quaternion.create(-parentRotation.x, -parentRotation.y, -parentRotation.z, parentRotation.w),
    worldRotation
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
    const shootState = animator.states.find((s) => s.clip === GUN_SHOOT_ANIM)
    if (shootState) {
      for (const s of animator.states) {
        s.playing = s.clip === GUN_SHOOT_ANIM
        s.loop = false
      }
      shootState.playing = true
      shootState.shouldReset = true
    }
  }
  rotationFreezeRemaining = SHOOT_ANIM_FREEZE_DURATION
}

function spawnProjectile(
  gunWorldPos: Vector3,
  gunWorldRot: { readonly x: number; readonly y: number; readonly z: number; readonly w: number },
  canDamage: boolean = true,
  weaponType: 'gun' | 'shotgun' | 'minigun' = 'gun',
  shotSeq: number = 0
): Vector3 {
  // Bullet direction = gun forward (where the barrel points), so bullet always matches gun aim
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
  const spawnPos = Vector3.add(gunWorldPos, offset)
  const projectile = engine.addEntity()
  Transform.create(projectile, {
    position: Vector3.clone(spawnPos),
    scale: Vector3.create(0.18, 0.18, 0.18)
  })
  MeshRenderer.setSphere(projectile)
  // Yellow-orange tracer – high contrast against red arena
  Material.setPbrMaterial(projectile, {
    albedoColor: Color4.create(1.0, 0.75, 0.0, 1.0),
    emissiveColor: Color3.create(1.0, 0.6, 0.0),
    emissiveIntensity: 1.5,
    metallic: 0.0,
    roughness: 0.3
  })
  ProjectileComponent.create(projectile, {
    direction,
    startPosition: Vector3.clone(spawnPos),
    canDamage,
    weaponType,
    shotSeq
  })
  return direction
}

export function createGun(): Entity {
  if (gunEntity !== null) return gunEntity

  const gun = engine.addEntity()
  const gunModel = engine.addEntity()
  const startPos =
    Transform.has(engine.PlayerEntity)
      ? Vector3.add(
          Transform.get(engine.PlayerEntity).position,
          Vector3.rotate(GUN_OFFSET, Transform.get(engine.PlayerEntity).rotation)
        )
      : Vector3.create(0, 0, 0)
  Transform.create(gun, {
    parent: Transform.has(engine.PlayerEntity) ? engine.PlayerEntity : undefined,
    position: GUN_OFFSET,
    rotation: Quaternion.Identity(),
    scale: Vector3.One()
  })

  Transform.create(gunModel, {
    parent: gun,
    position: GUN_MODEL_VISUAL_OFFSET,
    rotation: Quaternion.Identity(),
    scale: Vector3.One()
  })

  GltfContainer.create(gunModel, {
    src: GUN_MODEL
  })

  Animator.create(gunModel, {
    states: [{ clip: GUN_SHOOT_ANIM, playing: false, loop: false, speed: 1 }]
  })

  gunEntity = gun
  gunModelEntity = gunModel
  return gun
}

export function destroyGun(): void {
  if (gunEntity !== null) {
    engine.removeEntityWithChildren(gunEntity)
    gunEntity = null
    gunModelEntity = null
  }
}

function projectileSystem(dt: number) {
  for (const [projectile, projData, transform] of engine.getEntitiesWith(
    ProjectileComponent,
    Transform
  )) {
    const currentPos = transform.position
    const dir = projData.direction
    const startPos = projData.startPosition

    // Move bullet straight; hit detection is done by TriggerArea on zombies (collider-based)
    const newPos = Vector3.add(currentPos, Vector3.scale(dir, PROJECTILE_SPEED * dt))

    // Remove if bullet went out of range (out of scene)
    const traveled = Vector3.distance(newPos, startPos)
    if (traveled > BULLET_MAX_DISTANCE) {
      engine.removeEntity(projectile)
      continue
    }

    const mutableTransform = Transform.getMutable(projectile)
    mutableTransform.position = newPos

    if (!projData.canDamage) continue

    for (const [zombie] of engine.getEntitiesWith(ZombieComponent, Transform)) {
      const zombiePos = Transform.get(zombie).position
      const dx = newPos.x - zombiePos.x
      const dy = newPos.y - (zombiePos.y + ZOMBIE_TARGET_HEIGHT)
      const dz = newPos.z - zombiePos.z
      const distSq = dx * dx + dy * dy + dz * dz
      if (distSq > PROJECTILE_HIT_RADIUS_SQ) continue

      damageZombie(zombie, 1, { weaponType: projData.weaponType as 'gun' | 'shotgun' | 'minigun', shotSeq: Math.floor(projData.shotSeq) })
      engine.removeEntity(projectile)
      break
    }
  }
}

export function gunSystem(dt: number) {
  if (!Transform.has(engine.PlayerEntity)) return

  const isInArena = isLocalPlayerInArena()
  const shouldShowDebugLobbyGun = DEBUG_SHOW_GUN_IN_LOBBY && !isInArena
  const shouldTrackGun = shouldShowDebugLobbyGun || (isInArena && getCurrentWeapon() === 'gun')

  if (!shouldTrackGun) {
    if (gunEntity) destroyGun()
    return
  }

  if (!gunEntity) {
    if (!shouldShowDebugLobbyGun && getCurrentWeapon() !== 'gun') return
    createGun()
  }

  if (!gunEntity) return

  if (rotationFreezeRemaining > 0) rotationFreezeRemaining -= dt

  const playerTransform = Transform.get(engine.PlayerEntity)
  const gunWorldPos = Vector3.add(
    playerTransform.position,
    Vector3.rotate(GUN_OFFSET, playerTransform.rotation)
  )
  const visibleGunPos = Vector3.clone(gunWorldPos)

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

  if (!isInArena) return

  const effectiveFireRate = FIRE_RATE / getFireRateMultiplier()
  shootTimer += dt
  if (shootTimer < effectiveFireRate) return

  const didShoot =
    inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN) ||
    inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)
  if (!didShoot) return

  shootTimer = 0
  playGunAnimation()
  const nextShotSeq = localShotSeq + 1
  const direction = spawnProjectile(visibleGunPos, visibleGunRot, true, 'gun', nextShotSeq)
  localShotSeq = nextShotSeq
  sendPlayerShotRequest('gun', visibleGunPos, direction, localShotSeq)
}

export function spawnReplicatedGunShotVisual(origin: Vector3, direction: Vector3): void {
  const directionXZ = Vector3.create(direction.x, 0, direction.z)
  const lenSq = directionXZ.x * directionXZ.x + directionXZ.z * directionXZ.z
  if (lenSq <= 0.0001) return
  const rotation = Quaternion.lookRotation(Vector3.normalize(directionXZ))
  spawnProjectile(origin, rotation, false, 'gun', 0)
}

export function initGunSystems() {
  engine.addSystem(projectileSystem)
  engine.addSystem(gunSystem, GUN_SYSTEM_PRIORITY_LAST, 'gunSystem')
}
