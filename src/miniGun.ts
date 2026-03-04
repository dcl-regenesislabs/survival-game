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
  MeshCollider,
  ColliderLayer
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4, Color3 } from '@dcl/sdk/math'
import { ProjectileComponent } from './gun'
import { getCurrentWeapon } from './weaponManager'
import { getFireRateMultiplier } from './rageEffect'

const GUN_MODEL = 'assets/scene/Models/MiniGun01/MiniGun01.glb'

// Animation name in Gun01.glb - change if your model uses a different name
const GUN_SHOOT_ANIM = 'Key.002Action'

// Gun config - tweak these to your liking
const GUN_OFFSET = Vector3.create(0, 0, 0) // Local offset from player (right, up, forward)
const ROUNDS_PER_SECOND = 5 // Minigun fires faster
const FIRE_RATE = 1 / ROUNDS_PER_SECOND // Seconds between shots (0.2s = 5 rounds/sec)
const PROJECTILE_SPEED = 10 // Meters per second - lower = slower bullets
// Muzzle position in gun local space (x=right, y=up, z=forward) – matches GLB mesh so bullets spawn at barrel
const MUZZLE_OFFSET_GUN_LOCAL = Vector3.create(0, 1.27, 0.25)
// Shorter freeze so rotation can update between shots (minigun fires every 0.2s; 0.4s would block rotation entirely)
const SHOOT_ANIM_FREEZE_DURATION = 0.06
// Bullet flies straight; remove after this distance from spawn (out of scene)
const BULLET_MAX_DISTANCE = 40
const GUN_SYSTEM_PRIORITY_LAST = -1000

// Unparented gun: we set position and rotation every frame (lerp/slerp to reduce jitter). Bullet spawns at exact gunWorldPos/gunWorldRot.
const GUN_POSITION_SMOOTH_SPEED = 12
const GUN_ROTATION_SMOOTH_SPEED = 12

let gunEntity: Entity | null = null
let shootTimer = 0
/** Seconds left to freeze gun rotation after shoot (animator.playing may not clear when clip ends) */
let rotationFreezeRemaining = 0

function playGunAnimation() {
  if (gunEntity && Animator.has(gunEntity)) {
    const animator = Animator.getMutable(gunEntity)
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
  gunWorldRot: { readonly x: number; readonly y: number; readonly z: number; readonly w: number }
) {
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
  // Red material like blood (no emissive glow) – matches zombie/player blood style
  Material.setPbrMaterial(projectile, {
    albedoColor: Color4.create(0.55, 0.05, 0.05, 0.95),
    emissiveColor: Color3.create(0.6, 0.1, 0.1),
    emissiveIntensity: 0.2,
    metallic: 0.1,
    roughness: 0.8
  })
  ProjectileComponent.create(projectile, {
    direction,
    startPosition: Vector3.clone(spawnPos)
  })
  // Bullets need a collider so they trigger zombie TriggerAreas
  MeshCollider.setSphere(projectile, ColliderLayer.CL_CUSTOM1)
}

export function createMiniGun(): Entity {
  const gun = engine.addEntity()
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

  GltfContainer.create(gun, {
    src: GUN_MODEL
  })

  // Add animator - adjust clip name if Gun01.glb uses something different
  Animator.create(gun, {
    states: [{ clip: GUN_SHOOT_ANIM, playing: false, loop: false, speed: 1 }]
  })

  gunEntity = gun
  return gun
}

export function destroyMiniGun(): void {
  if (gunEntity !== null) {
    engine.removeEntity(gunEntity)
    gunEntity = null
  }
}

export function miniGunSystem(dt: number) {
  if (getCurrentWeapon() !== 'minigun' || !Transform.has(engine.PlayerEntity) || !gunEntity) return

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

  const aimDir = Vector3.rotate(Vector3.Forward(), playerTransform.rotation)
  const aimDirXZ = Vector3.create(aimDir.x, 0, aimDir.z)
  const lenSqXZ = aimDirXZ.x * aimDirXZ.x + aimDirXZ.z * aimDirXZ.z
  let gunWorldRot = Transform.get(gunEntity).rotation

  if (rotationFreezeRemaining <= 0 && lenSqXZ > 0.001) {
    gunWorldRot = Quaternion.lookRotation(Vector3.normalize(aimDirXZ))
    const currentRot = Transform.get(gunEntity).rotation
    const rotSmooth = 1 - Math.exp(-GUN_ROTATION_SMOOTH_SPEED * dt)
    mutableGunTransform.rotation = Quaternion.slerp(currentRot, gunWorldRot, rotSmooth)
  }

  const effectiveFireRate = FIRE_RATE / getFireRateMultiplier()
  shootTimer += dt
  if (shootTimer < effectiveFireRate) return

  const didShoot =
    inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN) ||
    inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)
  if (!didShoot) return

  shootTimer = 0
  playGunAnimation()
  spawnProjectile(gunWorldPos, gunWorldRot)
}

export function initMiniGunSystems() {
  engine.addSystem(miniGunSystem, GUN_SYSTEM_PRIORITY_LAST, 'miniGunSystem')
}
