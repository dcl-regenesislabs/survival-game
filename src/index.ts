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
  ColliderLayer,
  SkyboxTime
} from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { setupUi } from './ui'
import {
  spawnZombie,
  spawnQuickZombie,
  spawnTankZombie,
  zombieSystem,
  bloodParticleSystem,
  rewardTextSystem,
  setPlayerDamageReporter
} from './zombie'
import { initGunSystems } from './gun'
import { initShotGunSystems } from './shotGun'
import { initMiniGunSystems } from './miniGun'
import { initBrickSystem } from './brick'
import { initHealthBarSystem } from './healthBar'
import { initWeaponLifecycleSystem } from './weaponManager'
import {
  isPlayerDead,
  getRespawnDelay,
  respawnPlayer
} from './playerHealth'
import { getGameTime } from './zombie'
import { rageEffectSystem } from './rageEffect'
import { initRageAura } from './rageAura'
import { potionPickupSystem, potionVisualSystem } from './potions'
import { EntityNames } from '../assets/scene/entity-names'
import { setupLobbyServer } from './server/lobbyServer'
import { getMatchRuntimeState, sendPlayerDamageRequest, setupLobbyClient } from './multiplayer/lobbyClient'
import { initMatchWaveClientSystem } from './multiplayer/matchWaveClient'
import { initLobbyWorldPanel } from './lobbyWorldPanel'
import { initDeathAnimationSystem } from './deathAnimation'
// import { initLoadoutWorldPanel } from './loadoutWorldPanel'
import { initTimeSync } from './shared/timeSync'
import { WaveCyclePhase } from './shared/matchRuntimeSchemas'

// Cinematic (Diablo-like) camera: follows player position but keeps fixed world rotation (no parent)
const CINEMATIC_CAMERA_HEIGHT = 12
const CINEMATIC_CAMERA_DISTANCE = 10 // Offset in world -Z from player (camera in front of default view)
const CINEMATIC_CAMERA_TILT_DEG = 55 // Look down at the scene
// Two-stage smoothing to kill jitter: first smooth the target, then smooth camera toward it
const CINEMATIC_TARGET_SMOOTH_SPEED = 4   // How fast smoothed target follows player (lower = less jitter)
const CINEMATIC_CAMERA_SMOOTH_SPEED = 6   // How fast camera follows smoothed target
const CINEMATIC_DT_MAX = 1 / 30            // Cap dt to avoid spikes from hitches (treat as ~30fps min)
const SKYBOX_DAY_TIME_SECONDS = 12 * 60 * 60 // 12:00
const SKYBOX_NIGHT_TIME_SECONDS = 0 // 00:00

let useCinematicCamera = false
let cinematicCameraEntity: ReturnType<typeof engine.addEntity> | null = null
let cinematicSmoothedTarget = Vector3.create(0, 0, 0)
let cinematicSmoothedTargetReady = false
let appliedSkyboxTime: number | null = null

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

function setSkyboxFixedTime(seconds: number): void {
  if (appliedSkyboxTime === seconds) return
  appliedSkyboxTime = seconds
  if (SkyboxTime.has(engine.RootEntity)) {
    SkyboxTime.getMutable(engine.RootEntity).fixedTime = seconds
    return
  }
  SkyboxTime.create(engine.RootEntity, { fixedTime: seconds })
}

function waveSkyboxSystem(): void {
  const runtime = getMatchRuntimeState()
  const isWaveActive = !!runtime?.isRunning && runtime.cyclePhase === WaveCyclePhase.ACTIVE
  setSkyboxFixedTime(isWaveActive ? SKYBOX_NIGHT_TIME_SECONDS : SKYBOX_DAY_TIME_SECONDS)
}

function setActiveCamera(cinematic: boolean) {
  useCinematicCamera = cinematic
  if (cinematic) cinematicSmoothedTargetReady = false // Re-init smoothed target when entering cinematic
  if (!MainCamera.has(engine.CameraEntity)) return
  const mainCamera = MainCamera.getMutable(engine.CameraEntity)
  mainCamera.virtualCameraEntity = cinematic && cinematicCameraEntity ? cinematicCameraEntity : undefined
}

export function main() {
  if (isServer()) {
    initTimeSync({ isServer: true })
    setupLobbyServer()
    return
  }

  initTimeSync({ isServer: false })
  setupLobbyClient()
  setPlayerDamageReporter((amount) => {
    if (isPlayerDead()) return
    sendPlayerDamageRequest(amount)
  })
  initLobbyWorldPanel()
  // Loadout panel disabled
  // initLoadoutWorldPanel()
  setupUi()
  engine.addSystem(waveSkyboxSystem, undefined, 'wave-skybox-system')

  // Cinematic camera: follows player position only, fixed world rotation (Diablo-style)
  cinematicCameraEntity = createCinematicCamera()
  engine.addSystem(cinematicCameraFollowSystem)
  setActiveCamera(false) // Start with regular camera

  // Blood burst particles (must run every frame to advance _gameTime)
  engine.addSystem(bloodParticleSystem)
  // Floating +ZC text on zombie kills
  engine.addSystem(rewardTextSystem)
  // Rage potion duration decay
  engine.addSystem(() => rageEffectSystem(getGameTime()))
  // Red aura around player when enraged
  initRageAura()
  // Deferred brick placement (spawn from game loop, not from UI callback)
  initBrickSystem()
  // Health bar billboards above zombies
  initHealthBarSystem()
  // Add zombie behavior system
  engine.addSystem(zombieSystem)
  // Potion pickup and visual (tilt + spin)
  engine.addSystem(potionPickupSystem)
  engine.addSystem(potionVisualSystem)
  initDeathAnimationSystem()
  // Authoritative match waves (30s active / 10s rest)
  initMatchWaveClientSystem()

  // Init all weapon systems (active weapon gets spawned when match starts)
  initWeaponLifecycleSystem()
  initGunSystems()
  initShotGunSystems()
  initMiniGunSystems()
}
