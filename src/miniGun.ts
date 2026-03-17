import {
  engine,
  Entity,
  Transform,
  inputSystem,
  InputAction,
  GltfContainer,
  Animator,
  MeshRenderer,
  Material,
  MeshCollider,
  ColliderLayer
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4, Color3 } from '@dcl/sdk/math'
import { ZombieComponent } from './zombie'
import { ProjectileComponent } from './gun'
import { getCurrentWeapon } from './weaponManager'
import { getFireRateMultiplier } from './rageEffect'
import { getLobbyState, getLocalAddress, isLocalReadyForMatch, sendPlayerShotRequest } from './multiplayer/lobbyClient'

const GUN_MODEL = 'assets/scene/Models/drones/minigun/DroneMinigun.glb'
const GUN_MODEL_VISUAL_OFFSET = Vector3.create(0.45, 1.15, 0.35)

const GUN_SHOOT_ANIM = 'DroneMinigunShoot'

// Gun config - tweak these to your liking
const GUN_OFFSET = Vector3.create(0, 0, 0) // Local offset from player (right, up, forward)
const ROUNDS_PER_SECOND = 5 // Minigun fires faster
const FIRE_RATE = 1 / ROUNDS_PER_SECOND // Seconds between shots (0.2s = 5 rounds/sec)
const SHOOT_RANGE = 100
const PROJECTILE_SPEED = 10 // Meters per second - lower = slower bullets
const ZOMBIE_TARGET_HEIGHT = 0.9 // Meters above zombie feet to aim at (0.9 = chest level)
// Muzzle position in gun local space (x=right, y=up, z=forward) – matches GLB mesh so bullets spawn at barrel
const MUZZLE_OFFSET_GUN_LOCAL = Vector3.create(0.45, 1.15, 0.58)
// Shorter freeze so rotation can update between shots (minigun fires every 0.2s; 0.4s would block rotation entirely)
const SHOOT_ANIM_FREEZE_DURATION = 0.06
// Bullet flies straight; remove after this distance from spawn (out of scene)
const BULLET_MAX_DISTANCE = 40
const GUN_SYSTEM_PRIORITY_LAST = -1000

// Unparented gun: we set position and rotation every frame (lerp/slerp to reduce jitter). Bullet spawns at exact gunWorldPos/gunWorldRot.
const GUN_POSITION_SMOOTH_SPEED = 12
const GUN_ROTATION_SMOOTH_SPEED = 12

let gunEntity: Entity | null = null
let gunModelEntity: Entity | null = null
let shootTimer = 0
/** Seconds left to freeze gun rotation after shoot (animator.playing may not clear when clip ends) */
let rotationFreezeRemaining = 0
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
  weaponType: 'gun' | 'shotgun' | 'minigun' = 'minigun',
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
  if (canDamage) {
    // Bullets need a collider so they trigger zombie TriggerAreas
    MeshCollider.setSphere(projectile, ColliderLayer.CL_CUSTOM1)
  }
  return direction
}

export function createMiniGun(): Entity {
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
    position: startPos,
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

export function destroyMiniGun(): void {
  if (gunEntity !== null) {
    engine.removeEntityWithChildren(gunEntity)
    gunEntity = null
    gunModelEntity = null
  }
}

export function miniGunSystem(dt: number) {
  if (getCurrentWeapon() !== 'minigun' || !Transform.has(engine.PlayerEntity) || !gunEntity) return
  const localAddress = getLocalAddress()
  const lobbyState = getLobbyState()
  const isInArena =
    !!localAddress &&
    !!lobbyState &&
    lobbyState.phase === 'match_created' &&
    lobbyState.arenaPlayers.some((player) => player.address === localAddress) &&
    isLocalReadyForMatch()
  if (!isInArena) return

  if (rotationFreezeRemaining > 0) rotationFreezeRemaining -= dt

  const playerTransform = Transform.get(engine.PlayerEntity)
  const gunWorldPos = Vector3.add(
    playerTransform.position,
    Vector3.rotate(GUN_OFFSET, playerTransform.rotation)
  )
  const mutableGunTransform = Transform.getMutable(gunEntity)
  const currentPos = Transform.get(gunEntity).position
  const posSmooth = 1 - Math.exp(-GUN_POSITION_SMOOTH_SPEED * dt)
  mutableGunTransform.position = Vector3.lerp(currentPos, gunWorldPos, posSmooth)
  const visibleGunPos = Vector3.clone(mutableGunTransform.position)

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

  if (rotationFreezeRemaining <= 0 && lenSqXZ > 0.001) {
    visibleGunRot = Quaternion.lookRotation(Vector3.normalize(aimDirXZ))
    const currentRot = Transform.get(gunEntity).rotation
    const rotSmooth = 1 - Math.exp(-GUN_ROTATION_SMOOTH_SPEED * dt)
    mutableGunTransform.rotation = Quaternion.slerp(currentRot, visibleGunRot, rotSmooth)
    visibleGunRot = mutableGunTransform.rotation
  }

  const effectiveFireRate = FIRE_RATE / getFireRateMultiplier()
  shootTimer += dt
  if (shootTimer < effectiveFireRate) return

  const didShoot =
    inputSystem.isPressed(InputAction.IA_POINTER) ||
    inputSystem.isPressed(InputAction.IA_PRIMARY)
  if (!didShoot) return

  shootTimer = 0
  playGunAnimation()
  const nextShotSeq = localShotSeq + 1
  const direction = spawnProjectile(visibleGunPos, visibleGunRot, true, 'minigun', nextShotSeq)
  localShotSeq = nextShotSeq
  sendPlayerShotRequest('minigun', visibleGunPos, direction, localShotSeq)
}

export function spawnReplicatedMiniGunShotVisual(origin: Vector3, direction: Vector3): void {
  const directionXZ = Vector3.create(direction.x, 0, direction.z)
  const lenSq = directionXZ.x * directionXZ.x + directionXZ.z * directionXZ.z
  if (lenSq <= 0.0001) return
  const rotation = Quaternion.lookRotation(Vector3.normalize(directionXZ))
  spawnProjectile(origin, rotation, false, 'minigun', 0)
}

export function initMiniGunSystems() {
  engine.addSystem(miniGunSystem, GUN_SYSTEM_PRIORITY_LAST, 'miniGunSystem')
}
