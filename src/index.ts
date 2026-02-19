import {
  engine,
  pointerEventsSystem,
  PointerEvents,
  InputAction,
  PointerEventType,
  Transform,
  MainCamera,
  VirtualCamera,
  MeshCollider,
  ColliderLayer
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { setupUi } from './ui'
import { spawnZombie, spawnQuickZombie, spawnTankZombie, zombieSystem, bloodParticleSystem } from './zombie'
import { createGun, initGunSystems } from './gun'
import { initShotGunSystems } from './shotGun'
import { initMiniGunSystems } from './miniGun'
import { waveManagerSystem, onStartPressed, resetToIdle } from './waveManager'
import { initBrickSystem } from './brick'
import { initHealthBarSystem, createHealthBarForPlayer } from './healthBar'
import {
  isPlayerDead,
  getDeathTime,
  getRespawnDelay,
  respawnPlayer
} from './playerHealth'
import { getGameTime } from './zombie'
import { rageEffectSystem } from './rageEffect'
import { initRageAura } from './rageAura'
import { potionPickupSystem, potionVisualSystem } from './potions'
import { EntityNames } from '../assets/scene/entity-names'

// Cinematic (Diablo-like) camera: follows player position but keeps fixed world rotation (no parent)
const CINEMATIC_CAMERA_HEIGHT = 12
const CINEMATIC_CAMERA_DISTANCE = 10 // Offset in world -Z from player (camera in front of default view)
const CINEMATIC_CAMERA_TILT_DEG = 55 // Look down at the scene
// Two-stage smoothing to kill jitter: first smooth the target, then smooth camera toward it
const CINEMATIC_TARGET_SMOOTH_SPEED = 4   // How fast smoothed target follows player (lower = less jitter)
const CINEMATIC_CAMERA_SMOOTH_SPEED = 6   // How fast camera follows smoothed target
const CINEMATIC_DT_MAX = 1 / 30            // Cap dt to avoid spikes from hitches (treat as ~30fps min)

let useCinematicCamera = false
let cinematicCameraEntity: ReturnType<typeof engine.addEntity> | null = null
let cinematicSmoothedTarget = Vector3.create(0, 0, 0)
let cinematicSmoothedTargetReady = false

// Fixed world offset: camera sits here relative to player; rotation never changes
const CINEMATIC_OFFSET = Vector3.create(0, CINEMATIC_CAMERA_HEIGHT, -CINEMATIC_CAMERA_DISTANCE)
const CINEMATIC_ROTATION = Quaternion.fromEulerDegrees(CINEMATIC_CAMERA_TILT_DEG, 0, 0)

function createCinematicCamera() {
  const entity = engine.addEntity()
  Transform.create(entity, {
    position: Vector3.create(0, 0, 0), // Smoothed toward target every frame
    rotation: CINEMATIC_ROTATION,
    scale: Vector3.One()
  })
  VirtualCamera.create(entity, {})
  return entity
}

function cinematicCameraFollowSystem(dt: number) {
  if (!useCinematicCamera || !cinematicCameraEntity || !Transform.has(engine.PlayerEntity)) return
  // Stabilize dt to avoid one-frame spikes causing visible jumps
  const stableDt = Math.min(dt, CINEMATIC_DT_MAX)
  const playerPos = Transform.get(engine.PlayerEntity).position
  const rawTarget = Vector3.add(playerPos, CINEMATIC_OFFSET)

  // Stage 1: smooth the target (filters jitter from player position)
  if (!cinematicSmoothedTargetReady) {
    cinematicSmoothedTarget = Vector3.clone(rawTarget)
    cinematicSmoothedTargetReady = true
  }
  const targetFactor = 1 - Math.exp(-CINEMATIC_TARGET_SMOOTH_SPEED * stableDt)
  cinematicSmoothedTarget = Vector3.lerp(cinematicSmoothedTarget, rawTarget, targetFactor)

  // Stage 2: smooth camera toward the smoothed target
  const camTransform = Transform.getMutable(cinematicCameraEntity)
  const currentPos = camTransform.position
  const cameraFactor = 1 - Math.exp(-CINEMATIC_CAMERA_SMOOTH_SPEED * stableDt)
  camTransform.position = Vector3.lerp(currentPos, cinematicSmoothedTarget, cameraFactor)
}

function deathRespawnSystem(_dt: number) {
  if (!isPlayerDead()) return
  const now = getGameTime()
  if (now - getDeathTime() >= getRespawnDelay()) {
    respawnPlayer()
    resetToIdle()
  }
}

function setActiveCamera(cinematic: boolean) {
  useCinematicCamera = cinematic
  if (cinematic) cinematicSmoothedTargetReady = false // Re-init smoothed target when entering cinematic
  if (!MainCamera.has(engine.CameraEntity)) return
  const mainCamera = MainCamera.getMutable(engine.CameraEntity)
  mainCamera.virtualCameraEntity = cinematic && cinematicCameraEntity ? cinematicCameraEntity : undefined
}

export function main() {
  setupUi()

  // Cinematic camera: follows player position only, fixed world rotation (Diablo-style)
  cinematicCameraEntity = createCinematicCamera()
  engine.addSystem(cinematicCameraFollowSystem)
  setActiveCamera(false) // Start with regular camera

  // Blood burst particles (must run every frame to advance _gameTime)
  engine.addSystem(bloodParticleSystem)
  // Rage potion duration decay
  engine.addSystem(() => rageEffectSystem(getGameTime()))
  // Red aura around player when enraged
  initRageAura()
  // Deferred brick placement (spawn from game loop, not from UI callback)
  initBrickSystem()
  // Health bar billboards above zombies and player
  initHealthBarSystem()
  createHealthBarForPlayer()
  // Add zombie behavior system
  engine.addSystem(zombieSystem)
  // Potion pickup and visual (tilt + spin)
  engine.addSystem(potionPickupSystem)
  engine.addSystem(potionVisualSystem)
  // Death respawn: after delay, respawn player and reset game
  engine.addSystem(deathRespawnSystem)
  // Wave manager: countdown, spawn schedule, wave complete
  engine.addSystem(waveManagerSystem)

  // Create starting gun and init all weapon systems (only active weapon runs per frame)
  createGun()
  initGunSystems()
  initShotGunSystems()
  initMiniGunSystems()

  // Setup Button click to spawn zombies
  const buttonEntity = engine.getEntityOrNullByName(EntityNames.Button)
  if (buttonEntity) {
    // Buttons from GLTF often have visibleMeshesCollisionMask: 0, so pointer raycast misses. Add a box collider for pointer/touch.
    MeshCollider.setBox(buttonEntity, ColliderLayer.CL_POINTER)
    PointerEvents.create(buttonEntity, {
      pointerEvents: [
        {
          eventType: PointerEventType.PET_DOWN,
          eventInfo: {
            button: InputAction.IA_POINTER,
            hoverText: 'Spawn Zombie',
            maxDistance: 10,
            showFeedback: true
          }
        },
        {
          eventType: PointerEventType.PET_DOWN,
          eventInfo: {
            button: InputAction.IA_PRIMARY,
            hoverText: 'Spawn Zombie',
            maxDistance: 10,
            showFeedback: true
          }
        }
      ]
    })

    pointerEventsSystem.onPointerDown(
      { entity: buttonEntity, opts: { button: InputAction.IA_POINTER, hoverText: 'Spawn Zombie' } },
      () => { spawnZombie() }
    )
    pointerEventsSystem.onPointerDown(
      { entity: buttonEntity, opts: { button: InputAction.IA_PRIMARY, hoverText: 'Spawn Zombie' } },
      () => { spawnZombie() }
    )
  }

  // Setup Button2 click to toggle regular / cinematic (Diablo-like) camera
  const button2Entity = engine.getEntityOrNullByName(EntityNames.Button2)
  if (button2Entity) {
    MeshCollider.setBox(button2Entity, ColliderLayer.CL_POINTER)
    PointerEvents.create(button2Entity, {
      pointerEvents: [
        {
          eventType: PointerEventType.PET_DOWN,
          eventInfo: {
            button: InputAction.IA_POINTER,
            hoverText: 'Toggle Camera',
            maxDistance: 10,
            showFeedback: true
          }
        },
        {
          eventType: PointerEventType.PET_DOWN,
          eventInfo: {
            button: InputAction.IA_PRIMARY,
            hoverText: 'Toggle Camera',
            maxDistance: 10,
            showFeedback: true
          }
        }
      ]
    })

    pointerEventsSystem.onPointerDown(
      { entity: button2Entity, opts: { button: InputAction.IA_POINTER, hoverText: 'Toggle Camera' } },
      () => { setActiveCamera(!useCinematicCamera) }
    )
    pointerEventsSystem.onPointerDown(
      { entity: button2Entity, opts: { button: InputAction.IA_PRIMARY, hoverText: 'Toggle Camera' } },
      () => { setActiveCamera(!useCinematicCamera) }
    )
  }

  // Button3: Start game / wave loop (PMV core loop)
  const button3Entity = engine.getEntityOrNullByName(EntityNames.Button3)
  if (button3Entity) {
    MeshCollider.setBox(button3Entity, ColliderLayer.CL_POINTER)
    PointerEvents.create(button3Entity, {
      pointerEvents: [
        {
          eventType: PointerEventType.PET_DOWN,
          eventInfo: {
            button: InputAction.IA_POINTER,
            hoverText: 'Start',
            maxDistance: 10,
            showFeedback: true
          }
        },
        {
          eventType: PointerEventType.PET_DOWN,
          eventInfo: {
            button: InputAction.IA_PRIMARY,
            hoverText: 'Start',
            maxDistance: 10,
            showFeedback: true
          }
        }
      ]
    })

    pointerEventsSystem.onPointerDown(
      { entity: button3Entity, opts: { button: InputAction.IA_POINTER, hoverText: 'Start' } },
      () => { onStartPressed() }
    )
    pointerEventsSystem.onPointerDown(
      { entity: button3Entity, opts: { button: InputAction.IA_PRIMARY, hoverText: 'Start' } },
      () => { onStartPressed() }
    )
  }

  // ButtonQuick: spawn quick zombie (fast, 2 HP)
  const buttonQuickEntity = engine.getEntityOrNullByName(EntityNames.ButtonQuick)
  if (buttonQuickEntity) {
    MeshCollider.setBox(buttonQuickEntity, ColliderLayer.CL_POINTER)
    PointerEvents.create(buttonQuickEntity, {
      pointerEvents: [
        {
          eventType: PointerEventType.PET_DOWN,
          eventInfo: {
            button: InputAction.IA_POINTER,
            hoverText: 'Spawn Quick Zombie',
            maxDistance: 10,
            showFeedback: true
          }
        },
        {
          eventType: PointerEventType.PET_DOWN,
          eventInfo: {
            button: InputAction.IA_PRIMARY,
            hoverText: 'Spawn Quick Zombie',
            maxDistance: 10,
            showFeedback: true
          }
        }
      ]
    })
    pointerEventsSystem.onPointerDown(
      { entity: buttonQuickEntity, opts: { button: InputAction.IA_POINTER, hoverText: 'Spawn Quick Zombie' } },
      () => { spawnQuickZombie() }
    )
    pointerEventsSystem.onPointerDown(
      { entity: buttonQuickEntity, opts: { button: InputAction.IA_PRIMARY, hoverText: 'Spawn Quick Zombie' } },
      () => { spawnQuickZombie() }
    )
  }

  // ButtonTank: spawn tank zombie (slow, 10 HP)
  const buttonTankEntity = engine.getEntityOrNullByName(EntityNames.ButtonTank)
  if (buttonTankEntity) {
    MeshCollider.setBox(buttonTankEntity, ColliderLayer.CL_POINTER)
    PointerEvents.create(buttonTankEntity, {
      pointerEvents: [
        {
          eventType: PointerEventType.PET_DOWN,
          eventInfo: {
            button: InputAction.IA_POINTER,
            hoverText: 'Spawn Tank Zombie',
            maxDistance: 10,
            showFeedback: true
          }
        },
        {
          eventType: PointerEventType.PET_DOWN,
          eventInfo: {
            button: InputAction.IA_PRIMARY,
            hoverText: 'Spawn Tank Zombie',
            maxDistance: 10,
            showFeedback: true
          }
        }
      ]
    })
    pointerEventsSystem.onPointerDown(
      { entity: buttonTankEntity, opts: { button: InputAction.IA_POINTER, hoverText: 'Spawn Tank Zombie' } },
      () => { spawnTankZombie() }
    )
    pointerEventsSystem.onPointerDown(
      { entity: buttonTankEntity, opts: { button: InputAction.IA_PRIMARY, hoverText: 'Spawn Tank Zombie' } },
      () => { spawnTankZombie() }
    )
  }
}

