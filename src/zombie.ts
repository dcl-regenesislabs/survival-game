import {
  engine,
  Entity,
  Transform,
  PlayerIdentityData,
  AudioSource,
  TextShape,
  GltfContainer,
  Animator,
  MeshRenderer,
  Material,
  Schemas
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4, Color3 } from '@dcl/sdk/math'
import { getBricks, damageBrick, BRICK_RADIUS } from './brick'
import { createHealthBarForZombie } from './healthBar'
import {
  getLocalAddress,
  getLobbyState,
  getPlayerCombatSnapshot,
  sendPlayerExplosionDamageRequest,
  sendRageShieldHitRequest,
  sendZombieExplodeRequest
} from './multiplayer/lobbyClient'
import { getCurrentWave } from './waveManager'
import { ARENA_SPAWN_MAX_X, ARENA_SPAWN_MAX_Z, ARENA_SPAWN_MIN_X, ARENA_SPAWN_MIN_Z } from './shared/arenaConfig'
import {
  getRageShieldContactDamage,
  getRageShieldHitIntervalSec,
  getRageShieldRadius,
  isRaging
} from './rageEffect'

// Animation clip names from Zombie.glb
const ANIM_ZOMBIE_UP = 'ZombieUP'
const ANIM_ZOMBIE_WALK = 'ZombieWalk'
const ANIM_ZOMBIE_ATTACK = 'ZombieAttack'
const ANIM_EXPLODER_UP = 'ZombieUp'
const ANIM_EXPLODER_CRAWL = 'ZombieCrawl'
const ANIM_EXPLODER_EXPLODE = 'ZombieCrawlExplode'
const ANIM_EXPLODER_VFX = 'KeyAction.001'

// Zombie state
export enum ZombieState {
  SPAWNING = 'spawning',
  WALKING = 'walking',
  ATTACKING = 'attacking',
  EXPLODING = 'exploding'
}

export enum ZombieKind {
  BASIC = 'basic',
  QUICK = 'quick',
  TANK = 'tank',
  EXPLODER = 'exploder'
}

// Custom component for zombie behavior
const ZombieComponentSchema = {
  kind: Schemas.EnumString<ZombieKind>(ZombieKind, ZombieKind.BASIC),
  state: Schemas.EnumString<ZombieState>(ZombieState, ZombieState.SPAWNING),
  spawnTimer: Schemas.Number,
  attackRange: Schemas.Number,
  attackCooldown: Schemas.Number,
  health: Schemas.Number,
  speed: Schemas.Number,
  walkAnimSpeed: Schemas.Number,
  spawnUpDuration: Schemas.Number,
  networkId: Schemas.String,
  damage: Schemas.Number,
  explosionRadius: Schemas.Number,
  explosionTimer: Schemas.Number,
  explosionDuration: Schemas.Number,
  explosionTriggered: Schemas.Boolean
}

export const ZombieComponent = engine.defineComponent('ZombieComponent', ZombieComponentSchema, {
  kind: ZombieKind.BASIC,
  state: ZombieState.SPAWNING,
  spawnTimer: 0,
  attackRange: 1.2,
  attackCooldown: 0,
  health: 3,
  speed: 1.5,
  walkAnimSpeed: 1,
  spawnUpDuration: 1.2,
  networkId: '',
  damage: 1,
  explosionRadius: 0,
  explosionTimer: 0,
  explosionDuration: 0,
  explosionTriggered: false
})

// Hostility thresholds
const HOSTILITY_WAVE_SPEED = 5   // wave where speed increases
const HOSTILITY_WAVE_DAMAGE = 11 // wave where speed + damage increase

type ZombieHostility = { speedMultiplier: number; damage: number }

function getHostilityForWave(wave: number): ZombieHostility {
  if (wave >= HOSTILITY_WAVE_DAMAGE) return { speedMultiplier: 2.0, damage: 2 }
  if (wave >= HOSTILITY_WAVE_SPEED)  return { speedMultiplier: 1.5, damage: 1 }
  return { speedMultiplier: 1, damage: 1 }
}

// Blood burst particles: fly outward and get removed when endTime is reached
const BloodParticleSchema = {
  velocity: Schemas.Vector3,
  endTime: Schemas.Number
}
const BloodParticleComponent = engine.defineComponent('BloodParticleComponent', BloodParticleSchema)
const RewardTextComponent = engine.defineComponent('RewardTextComponent', {
  active: Schemas.Boolean,
  endTime: Schemas.Number,
  riseSpeed: Schemas.Number
})
const ExplosionVfxComponent = engine.defineComponent('ExplosionVfxComponent', {
  endTime: Schemas.Number
})

let _gameTime = 0
export function getGameTime(): number {
  return _gameTime
}

const ZOMBIE_SPEED = 1.5
const ZOMBIE_UP_DURATION = 1.2 // Approximate ZombieUP animation length in seconds
const EXPLODER_SPEED = 3.75
const EXPLODER_CRAWL_ANIM_SPEED = 1.9
const EXPLODER_UP_DURATION = 0.18
const EXPLODER_ATTACK_RANGE = 1.05
const EXPLODER_DAMAGE = 5
const EXPLODER_RADIUS = 2
const EXPLODER_WARNING_DURATION = 0.5
const EXPLODER_DETONATION_DURATION = 1.35
const EXPLODER_VFX_DURATION = 1.25
const EXPLODER_VFX_SCALE = 1.8
const EXPLODER_WARNING_RING_THICKNESS = 0.06
const EXPLODER_WARNING_RING_ALPHA = 0.68
// When a zombie is within this range of a brick, it targets the brick instead of the player
const BRICK_AGRO_RANGE = 2.5
const ZOMBIE_DEATH_SOUND_URL = 'assets/sounds/alex_jauk-zombie-screaming-207590.mp3'
const REWARD_TEXT_DURATION = 0.9
const REWARD_TEXT_RISE_SPEED = 1.15
const REWARD_TEXT_BASE_COLOR = Color4.create(0.0, 1.0, 0.92, 1)
const REWARD_TEXT_Y_OFFSET = 2.7
const REWARD_TEXT_SCALE = 0.9
const REWARD_TEXT_FACING_FIX = Quaternion.fromEulerDegrees(0, 180, 0)
const REWARD_TEXT_POOL_SIZE = 24

const rewardTextPool: Entity[] = []
let rewardTextPoolInitialized = false
let nextRewardTextPoolIndex = 0

type SpawnZombieOptions = {
  position?: Vector3
  networkId?: string
}

type ZombieHitWeaponType = 'gun' | 'shotgun' | 'minigun'

let reportServerZombieHit: ((zombieId: string, damage: number, weaponType: ZombieHitWeaponType, shotSeq: number) => void) | null = null
let zombieDeathSoundEntity: Entity | null = null
let reportPlayerDamageToServer: ((amount: number) => void) | null = null
const lastRageShieldHitAtByZombieKey = new Map<string, number>()
const explodedZombieIds = new Set<string>()
const exploderWarningRingByZombie = new Map<Entity, Entity>()
export function setZombieHitReporter(
  reporter: ((zombieId: string, damage: number, weaponType: ZombieHitWeaponType, shotSeq: number) => void) | null
): void {
  reportServerZombieHit = reporter
}
export function setPlayerDamageReporter(reporter: ((amount: number) => void) | null): void {
  reportPlayerDamageToServer = reporter
}

function playZombieDeathSound(): void {
  if (zombieDeathSoundEntity === null) {
    zombieDeathSoundEntity = engine.addEntity()
    Transform.create(zombieDeathSoundEntity, {
      position: Vector3.create(0, 0, 0),
      rotation: Quaternion.Identity(),
      scale: Vector3.One()
    })
    AudioSource.create(zombieDeathSoundEntity, {
      audioClipUrl: ZOMBIE_DEATH_SOUND_URL,
      loop: false,
      volume: 0.8,
      global: true,
      currentTime: 0,
      playing: true
    })
    return
  }

  const audio = AudioSource.getMutable(zombieDeathSoundEntity)
  audio.audioClipUrl = ZOMBIE_DEATH_SOUND_URL
  audio.loop = false
  audio.global = true
  audio.volume = 0.8
  audio.currentTime = 0
  audio.playing = true
}

function getRandomSpawnPosition(): Vector3 {
  const x = ARENA_SPAWN_MIN_X + Math.random() * (ARENA_SPAWN_MAX_X - ARENA_SPAWN_MIN_X)
  const z = ARENA_SPAWN_MIN_Z + Math.random() * (ARENA_SPAWN_MAX_Z - ARENA_SPAWN_MIN_Z)
  return Vector3.create(x, 0, z)
}

function playZombieAnimation(entity: Entity, clip: string, loop: boolean, clipSpeed: number = 1) {
  if (!Animator.has(entity)) return
  const animator = Animator.getMutable(entity)
  for (const state of animator.states) {
    const isActive = state.clip === clip
    state.playing = isActive
    state.loop = isActive ? loop : false
    if (isActive) state.speed = clipSpeed
  }
}

function createZombieRoot(position: Vector3, modelSrc: string): Entity {
  const zombie = engine.addEntity()
  Transform.create(zombie, {
    position,
    rotation: Quaternion.Identity(),
    scale: Vector3.One()
  })
  GltfContainer.create(zombie, {
    src: modelSrc,
    visibleMeshesCollisionMask: 0,
    invisibleMeshesCollisionMask: 0
  })
  return zombie
}

function playExploderVfx(position: Vector3): void {
  const vfx = engine.addEntity()
  Transform.create(vfx, {
    position: Vector3.clone(position),
    rotation: Quaternion.Identity(),
    scale: Vector3.create(EXPLODER_VFX_SCALE, EXPLODER_VFX_SCALE, EXPLODER_VFX_SCALE)
  })
  GltfContainer.create(vfx, {
    src: 'assets/scene/Models/zombieExplode/SlimeExplode.glb',
    visibleMeshesCollisionMask: 0,
    invisibleMeshesCollisionMask: 0
  })
  Animator.create(vfx, {
    states: [{ clip: ANIM_EXPLODER_VFX, playing: true, loop: false, speed: 1 }]
  })
  ExplosionVfxComponent.create(vfx, {
    endTime: _gameTime + EXPLODER_VFX_DURATION
  })
}

function showExploderWarningRing(zombie: Entity, center: Vector3, radius: number): void {
  removeExploderWarningRing(zombie)

  const ring = engine.addEntity()
  Transform.create(ring, {
    position: Vector3.create(center.x, center.y + 0.03, center.z),
    rotation: Quaternion.Identity(),
    scale: Vector3.create(radius * 2, EXPLODER_WARNING_RING_THICKNESS, radius * 2)
  })
  MeshRenderer.setSphere(ring)
  Material.setPbrMaterial(ring, {
    albedoColor: Color4.create(0.62, 1, 0.18, EXPLODER_WARNING_RING_ALPHA),
    emissiveColor: Color3.create(0.62, 1, 0.18),
    emissiveIntensity: 0.8,
    metallic: 0,
    roughness: 0.35
  })
  exploderWarningRingByZombie.set(zombie, ring)
}

function removeExploderWarningRing(zombie: Entity): void {
  const ring = exploderWarningRingByZombie.get(zombie)
  if (!ring) return
  exploderWarningRingByZombie.delete(zombie)
  engine.removeEntity(ring)
}

function applyExploderDamageToLocalPlayer(zombieId: string, center: Vector3, radius: number): void {
  if (!Transform.has(engine.PlayerEntity)) return
  const localAddress = getLocalAddress()
  if (localAddress && getPlayerCombatSnapshot(localAddress)?.isDead) return
  const localPos = Transform.get(engine.PlayerEntity).position
  if (distanceXZ(localPos, center) > radius) return
  sendPlayerExplosionDamageRequest(zombieId, EXPLODER_DAMAGE)
}

function startZombieExplosion(entity: Entity): boolean {
  if (!Transform.has(entity)) return false
  if (!ZombieComponent.has(entity)) return false

  const mutableZombie = ZombieComponent.getMutable(entity)
  if (mutableZombie.state === ZombieState.EXPLODING) return false

  const position = Vector3.clone(Transform.get(entity).position)
  mutableZombie.state = ZombieState.EXPLODING
  mutableZombie.attackCooldown = 0
  mutableZombie.health = 0
  mutableZombie.explosionTimer = 0
  mutableZombie.explosionDuration = EXPLODER_DETONATION_DURATION
  mutableZombie.explosionTriggered = false
  playZombieAnimation(entity, ANIM_EXPLODER_EXPLODE, false)
  showExploderWarningRing(entity, position, mutableZombie.explosionRadius)
  return true
}

function commitZombieExplosion(entity: Entity): void {
  startZombieExplosion(entity)
}

function requestNetworkZombieExplosion(entity: Entity, zombieId: string): void {
  if (!zombieId || explodedZombieIds.has(zombieId)) return
  startZombieExplosion(entity)
  explodedZombieIds.add(zombieId)
  sendZombieExplodeRequest(zombieId)
}

export function spawnZombie(options?: SpawnZombieOptions): Entity {
  const spawnPos = options?.position ? Vector3.clone(options.position) : getRandomSpawnPosition()
  const zombie = createZombieRoot(spawnPos, 'assets/custom/zombiebasic/Zombie.glb')

  const hostility = getHostilityForWave(getCurrentWave())
  const speed = ZOMBIE_SPEED * hostility.speedMultiplier

  // Animator with all three animation states - start with ZombieUP
  Animator.create(zombie, {
    states: [
      { clip: ANIM_ZOMBIE_UP, playing: true, loop: false, speed: 1 },
      { clip: ANIM_ZOMBIE_WALK, playing: false, loop: true, speed: 1 },
      { clip: ANIM_ZOMBIE_ATTACK, playing: false, loop: true, speed: 1 }
    ]
  })

  ZombieComponent.create(zombie, {
    kind: ZombieKind.BASIC,
    state: ZombieState.SPAWNING,
    spawnTimer: 0,
    attackRange: 1.2,
    attackCooldown: 0,
    health: 3,
    speed,
    walkAnimSpeed: 1,
    spawnUpDuration: ZOMBIE_UP_DURATION,
    networkId: options?.networkId ?? '',
    damage: hostility.damage,
    explosionRadius: 0,
    explosionTimer: 0,
    explosionDuration: 0,
    explosionTriggered: false
  })

  createHealthBarForZombie(zombie, 3) // default height
  return zombie
}

/** Quick zombie: ZombieYellow.glb, faster movement, 2 HP. */
export function spawnQuickZombie(options?: SpawnZombieOptions): Entity {
  const spawnPos = options?.position ? Vector3.clone(options.position) : getRandomSpawnPosition()
  const zombie = createZombieRoot(spawnPos, 'assets/scene/Models/ZombieYellow/ZombieYellow.glb')

  const hostility = getHostilityForWave(getCurrentWave())
  const quickSpeed = 2.6 * hostility.speedMultiplier
  const quickWalkAnimSpeed = 1.7

  Animator.create(zombie, {
    states: [
      { clip: ANIM_ZOMBIE_UP, playing: true, loop: false, speed: 1 },
      { clip: ANIM_ZOMBIE_WALK, playing: false, loop: true, speed: quickWalkAnimSpeed },
      { clip: ANIM_ZOMBIE_ATTACK, playing: false, loop: true, speed: 1 }
    ]
  })

  ZombieComponent.create(zombie, {
    kind: ZombieKind.QUICK,
    state: ZombieState.SPAWNING,
    spawnTimer: 0,
    attackRange: 1.2,
    attackCooldown: 0,
    health: 2,
    speed: quickSpeed,
    walkAnimSpeed: quickWalkAnimSpeed,
    spawnUpDuration: ZOMBIE_UP_DURATION,
    networkId: options?.networkId ?? '',
    damage: hostility.damage,
    explosionRadius: 0,
    explosionTimer: 0,
    explosionDuration: 0,
    explosionTriggered: false
  })

  createHealthBarForZombie(zombie, 2, 1.55) // a bit lower
  return zombie
}

/** Tank zombie: ZombiePurple.glb, slower movement, 10 HP. */
export function spawnTankZombie(options?: SpawnZombieOptions): Entity {
  const spawnPos = options?.position ? Vector3.clone(options.position) : getRandomSpawnPosition()
  const zombie = createZombieRoot(spawnPos, 'assets/scene/Models/ZombiePurple/ZombiePurple.glb')

  const hostility = getHostilityForWave(getCurrentWave())
  const tankSpeed = 0.75 * hostility.speedMultiplier
  const tankWalkAnimSpeed = 0.6
  const tankDamage = hostility.damage >= 2 ? 3 : 1

  Animator.create(zombie, {
    states: [
      { clip: ANIM_ZOMBIE_UP, playing: true, loop: false, speed: 1 },
      { clip: ANIM_ZOMBIE_WALK, playing: false, loop: true, speed: tankWalkAnimSpeed },
      { clip: ANIM_ZOMBIE_ATTACK, playing: false, loop: true, speed: 1 }
    ]
  })

  ZombieComponent.create(zombie, {
    kind: ZombieKind.TANK,
    state: ZombieState.SPAWNING,
    spawnTimer: 0,
    attackRange: 1.2,
    attackCooldown: 0,
    health: 10,
    speed: tankSpeed,
    walkAnimSpeed: tankWalkAnimSpeed,
    spawnUpDuration: ZOMBIE_UP_DURATION,
    networkId: options?.networkId ?? '',
    damage: tankDamage,
    explosionRadius: 0,
    explosionTimer: 0,
    explosionDuration: 0,
    explosionTriggered: false
  })

  createHealthBarForZombie(zombie, 10, 2.75) // a bit higher
  return zombie
}

export function spawnExploderZombie(options?: SpawnZombieOptions): Entity {
  const spawnPos = options?.position ? Vector3.clone(options.position) : getRandomSpawnPosition()
  const zombie = createZombieRoot(spawnPos, 'assets/scene/Models/zombieExplode/ZombieExplode.glb')

  Animator.create(zombie, {
    states: [
      { clip: ANIM_EXPLODER_UP, playing: true, loop: false, speed: 1 },
      { clip: ANIM_EXPLODER_CRAWL, playing: false, loop: true, speed: EXPLODER_CRAWL_ANIM_SPEED },
      { clip: ANIM_EXPLODER_EXPLODE, playing: false, loop: false, speed: 1 }
    ]
  })

  ZombieComponent.create(zombie, {
    kind: ZombieKind.EXPLODER,
    state: ZombieState.SPAWNING,
    spawnTimer: 0,
    attackRange: EXPLODER_ATTACK_RANGE,
    attackCooldown: 0,
    health: 15,
    speed: EXPLODER_SPEED,
    walkAnimSpeed: EXPLODER_CRAWL_ANIM_SPEED,
    spawnUpDuration: EXPLODER_UP_DURATION,
    networkId: options?.networkId ?? '',
    damage: EXPLODER_DAMAGE,
    explosionRadius: EXPLODER_RADIUS,
    explosionTimer: 0,
    explosionDuration: 0,
    explosionTriggered: false
  })

  createHealthBarForZombie(zombie, 15, 1.2)
  return zombie
}

const BLOOD_BURST_DURATION = 0.5
const HIT_BURST_COUNT = 10
const HIT_BURST_SPEED = 4
const HIT_BURST_SCALE = 0.12
const DEATH_BURST_COUNT = 20
const DEATH_BURST_SPEED = 5
const DEATH_BURST_SCALE = 0.18

// Red material for blood particles
const BLOOD_MATERIAL = {
  albedoColor: Color4.create(0.55, 0.05, 0.05, 0.95),
  emissiveColor: Color3.create(0.6, 0.1, 0.1),
  emissiveIntensity: 0.2,
  metallic: 0.1,
  roughness: 0.8
}

/** Spawn blood-like particles bursting outward from a point (world position). */
export function spawnBloodAtPosition(center: Vector3): void {
  spawnBloodBurst(center, HIT_BURST_COUNT, HIT_BURST_SPEED, BLOOD_BURST_DURATION, HIT_BURST_SCALE)
}

export function spawnZcRewardTextAtPosition(center: Vector3, amount: number): void {
  ensureRewardTextPool()
  const xJitter = (Math.random() - 0.5) * 0.45
  const zJitter = (Math.random() - 0.5) * 0.35
  const entity = rewardTextPool[nextRewardTextPoolIndex]
  nextRewardTextPoolIndex = (nextRewardTextPoolIndex + 1) % rewardTextPool.length

  const transform = Transform.getMutable(entity)
  transform.position = Vector3.create(center.x + xJitter, center.y + REWARD_TEXT_Y_OFFSET, center.z + zJitter)
  transform.rotation = Quaternion.Identity()
  transform.scale = Vector3.create(REWARD_TEXT_SCALE, REWARD_TEXT_SCALE, REWARD_TEXT_SCALE)

  const textShape = TextShape.getMutable(entity)
  textShape.text = `+${Math.max(0, Math.floor(amount))}`
  textShape.textColor = REWARD_TEXT_BASE_COLOR

  const reward = RewardTextComponent.getMutable(entity)
  reward.active = true
  reward.endTime = _gameTime + REWARD_TEXT_DURATION
  reward.riseSpeed = REWARD_TEXT_RISE_SPEED
}

function ensureRewardTextPool(): void {
  if (rewardTextPoolInitialized) return
  rewardTextPoolInitialized = true

  for (let i = 0; i < REWARD_TEXT_POOL_SIZE; i++) {
    const entity = engine.addEntity()
    Transform.create(entity, {
      position: Vector3.create(0, -1000, 0),
      rotation: Quaternion.Identity(),
      scale: Vector3.Zero()
    })
    TextShape.create(entity, {
      text: '',
      fontSize: 7.4,
      width: 6.5,
      height: 2,
      textColor: Color4.create(REWARD_TEXT_BASE_COLOR.r, REWARD_TEXT_BASE_COLOR.g, REWARD_TEXT_BASE_COLOR.b, 0),
      outlineWidth: 0.32,
      outlineColor: Color3.create(0, 0, 0)
    })
    RewardTextComponent.create(entity, {
      active: false,
      endTime: 0,
      riseSpeed: REWARD_TEXT_RISE_SPEED
    })
    rewardTextPool.push(entity)
  }
}

function spawnBloodBurst(
  center: Vector3,
  count: number,
  speed: number,
  duration: number,
  particleScale: number
) {
  const endTime = _gameTime + duration
  for (let i = 0; i < count; i++) {
    // Random direction mostly outward and slightly up
    const x = (Math.random() - 0.5) * 2
    const y = Math.random() * 1.2 + 0.3
    const z = (Math.random() - 0.5) * 2
    const dir = Vector3.normalize(Vector3.create(x, y, z))
    const velocity = Vector3.scale(dir, speed * (0.7 + Math.random() * 0.6))

    const e = engine.addEntity()
    Transform.create(e, {
      position: Vector3.clone(center),
      rotation: Quaternion.Identity(),
      scale: Vector3.create(particleScale, particleScale, particleScale)
    })
    MeshRenderer.setBox(e)
    Material.setPbrMaterial(e, BLOOD_MATERIAL)
    BloodParticleComponent.create(e, { velocity, endTime })
  }
}

/** Remove all zombies from the scene (used when resetting the game after death). */
export function despawnAllZombies(): void {
  const toRemove: Entity[] = []
  for (const [entity] of engine.getEntitiesWith(ZombieComponent)) {
    removeExploderWarningRing(entity)
    toRemove.push(entity)
  }
  for (const e of toRemove) engine.removeEntity(e)
  lastRageShieldHitAtByZombieKey.clear()
  explodedZombieIds.clear()
}

export function despawnZombieByNetworkId(zombieId: string): boolean {
  for (const [entity, zombieData] of engine.getEntitiesWith(ZombieComponent)) {
    if (zombieData.networkId === zombieId) {
      removeExploderWarningRing(entity)
      lastRageShieldHitAtByZombieKey.delete(zombieId)
      explodedZombieIds.delete(zombieId)
      const pos = Transform.has(entity) ? Transform.get(entity).position : null
      playZombieDeathSound()
      if (pos) {
        const burstCenter = Vector3.create(pos.x, pos.y + 0.9, pos.z)
        spawnBloodBurst(burstCenter, DEATH_BURST_COUNT, DEATH_BURST_SPEED, BLOOD_BURST_DURATION, DEATH_BURST_SCALE)
      }
      engine.removeEntity(entity)
      return true
    }
  }
  return false
}

export function explodeZombieByNetworkId(zombieId: string): boolean {
  for (const [entity, zombieData] of engine.getEntitiesWith(ZombieComponent)) {
    if (zombieData.networkId !== zombieId) continue
    commitZombieExplosion(entity)
    explodedZombieIds.add(zombieId)
    return true
  }
  return false
}

export function getZombiePositionByNetworkId(zombieId: string): Vector3 | null {
  for (const [entity, zombieData] of engine.getEntitiesWith(ZombieComponent, Transform)) {
    if (zombieData.networkId !== zombieId) continue
    return Vector3.clone(Transform.get(entity).position)
  }
  return null
}

export function applyZombieHealthUpdateByNetworkId(zombieId: string, hp: number): boolean {
  const nextHp = Math.max(0, Math.floor(hp))
  for (const [entity, zombieData] of engine.getEntitiesWith(ZombieComponent, Transform)) {
    if (zombieData.networkId !== zombieId) continue
    const mutableZombie = ZombieComponent.getMutable(entity)
    const previousHp = mutableZombie.health
    mutableZombie.health = nextHp
    if (nextHp < previousHp) {
      const pos = Transform.get(entity).position
      const burstCenter = Vector3.create(pos.x, pos.y + 0.9, pos.z)
      spawnBloodBurst(burstCenter, HIT_BURST_COUNT, HIT_BURST_SPEED, BLOOD_BURST_DURATION, HIT_BURST_SCALE)
    }
    return true
  }
  return false
}

/** Apply damage to a zombie. Networked zombies report hits to the server; local-only zombies resolve immediately. */
export function damageZombie(
  entity: Entity,
  amount: number,
  hitSource?: { weaponType: ZombieHitWeaponType; shotSeq: number }
): boolean {
  if (!ZombieComponent.has(entity)) return false
  const zombie = ZombieComponent.get(entity)
  if (zombie.networkId) {
    if (hitSource) {
      reportServerZombieHit?.(zombie.networkId, amount, hitSource.weaponType, hitSource.shotSeq)
    }
    return false
  }

  const mutableZombie = ZombieComponent.getMutable(entity)
  mutableZombie.health -= amount

  const pos = Transform.get(entity).position
  const burstCenter = Vector3.create(pos.x, pos.y + 0.9, pos.z)

  if (mutableZombie.health <= 0) {
    playZombieDeathSound()
    spawnBloodBurst(burstCenter, DEATH_BURST_COUNT, DEATH_BURST_SPEED, BLOOD_BURST_DURATION, DEATH_BURST_SCALE)
    engine.removeEntity(entity)
    return true
  }

  spawnBloodBurst(burstCenter, HIT_BURST_COUNT, HIT_BURST_SPEED, BLOOD_BURST_DURATION, HIT_BURST_SCALE)
  return false
}

/** Move blood particles and remove when expired. */
export function bloodParticleSystem(dt: number) {
  _gameTime += dt
  const toRemove: Entity[] = []
  for (const [entity, particle, transform] of engine.getEntitiesWith(
    BloodParticleComponent,
    Transform
  )) {
    if (_gameTime >= particle.endTime) {
      toRemove.push(entity)
      continue
    }
    const pos = transform.position
    const vel = particle.velocity
    Transform.getMutable(entity).position = Vector3.create(
      pos.x + vel.x * dt,
      pos.y + vel.y * dt,
      pos.z + vel.z * dt
    )
  }
  for (const e of toRemove) engine.removeEntity(e)
}

export function explosionVfxSystem(): void {
  const toRemove: Entity[] = []
  for (const [entity, vfx] of engine.getEntitiesWith(ExplosionVfxComponent)) {
    if (_gameTime < vfx.endTime) continue
    toRemove.push(entity)
  }
  for (const entity of toRemove) engine.removeEntity(entity)
}

export function rewardTextSystem(dt: number) {
  const cameraPos = Transform.has(engine.CameraEntity) ? Transform.get(engine.CameraEntity).position : null
  for (const [entity, reward, transform] of engine.getEntitiesWith(RewardTextComponent, Transform, TextShape)) {
    if (!reward.active) continue

    if (_gameTime >= reward.endTime) {
      const mutableReward = RewardTextComponent.getMutable(entity)
      mutableReward.active = false
      const mutableTransform = Transform.getMutable(entity)
      mutableTransform.position = Vector3.create(0, -1000, 0)
      mutableTransform.scale = Vector3.Zero()
      const textShape = TextShape.getMutable(entity)
      textShape.textColor = Color4.create(REWARD_TEXT_BASE_COLOR.r, REWARD_TEXT_BASE_COLOR.g, REWARD_TEXT_BASE_COLOR.b, 0)
      continue
    }

    const mutableTransform = Transform.getMutable(entity)
    const pos = transform.position
    mutableTransform.position = Vector3.create(pos.x, pos.y + reward.riseSpeed * dt, pos.z)
    if (cameraPos) {
      const toCam = Vector3.subtract(cameraPos, mutableTransform.position)
      toCam.y = 0
      const lenXZ = Math.sqrt(toCam.x * toCam.x + toCam.z * toCam.z)
      if (lenXZ > 0.001) {
        const faceCam = Quaternion.lookRotation(Vector3.normalize(toCam))
        mutableTransform.rotation = Quaternion.multiply(REWARD_TEXT_FACING_FIX, faceCam)
      }
    }

    const remaining = reward.endTime - _gameTime
    const alpha = Math.max(0, Math.min(1, remaining / REWARD_TEXT_DURATION))
    const textShape = TextShape.getMutable(entity)
    textShape.textColor = Color4.create(REWARD_TEXT_BASE_COLOR.r, REWARD_TEXT_BASE_COLOR.g, REWARD_TEXT_BASE_COLOR.b, alpha)
  }
}

function distanceXZ(a: Vector3, b: Vector3): number {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dz * dz)
}

type NearestPlayerTarget = {
  position: Vector3
  isLocalPlayer: boolean
}

function getNearestPlayerTarget(zombiePos: Vector3, fallbackPos: Vector3): NearestPlayerTarget {
  const lobbyState = getLobbyState()
  if (!lobbyState?.arenaPlayers.length) {
    return { position: fallbackPos, isLocalPlayer: true }
  }

  const activeAddresses = new Set(lobbyState.arenaPlayers.map((player) => player.address.toLowerCase()))
  let nearestPlayerPos: Vector3 | null = null
  let nearestIsLocalPlayer = false
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const [entity, identity, transform] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
    const address = identity.address.toLowerCase()
    if (!activeAddresses.has(address)) continue
    const combat = getPlayerCombatSnapshot(address)
    if (combat?.isDead) continue

    const candidatePos = transform.position
    const candidateDistance = distanceXZ(zombiePos, candidatePos)
    if (candidateDistance >= nearestDistance) continue

    nearestDistance = candidateDistance
    nearestPlayerPos = candidatePos
    nearestIsLocalPlayer = entity === engine.PlayerEntity
  }

  if (!nearestPlayerPos) {
    return { position: fallbackPos, isLocalPlayer: true }
  }

  return {
    position: nearestPlayerPos,
    isLocalPlayer: nearestIsLocalPlayer
  }
}

export function zombieSystem(dt: number) {
  if (!Transform.has(engine.PlayerEntity)) return

  const playerPos = Transform.get(engine.PlayerEntity).position
  const rageShieldActive = isRaging()
  const rageShieldRadius = getRageShieldRadius()
  const rageShieldHitIntervalSec = getRageShieldHitIntervalSec()
  const bricks = getBricks()

  for (const [zombie, zombieData, transform] of engine.getEntitiesWith(
    ZombieComponent,
    Transform,
    GltfContainer,
    Animator
  )) {
    const mutableZombie = ZombieComponent.getMutable(zombie)
    const mutableTransform = Transform.getMutable(zombie)

    const zombiePos = transform.position

    if (mutableZombie.state === ZombieState.EXPLODING) {
      mutableZombie.explosionTimer += dt
      if (!mutableZombie.explosionTriggered && mutableZombie.explosionTimer >= EXPLODER_WARNING_DURATION) {
        mutableZombie.explosionTriggered = true
        removeExploderWarningRing(zombie)
        playExploderVfx(Vector3.create(zombiePos.x, zombiePos.y + 0.15, zombiePos.z))
        if (zombieData.networkId) {
          applyExploderDamageToLocalPlayer(zombieData.networkId, zombiePos, mutableZombie.explosionRadius)
        } else if (Transform.has(engine.PlayerEntity)) {
          const localPos = Transform.get(engine.PlayerEntity).position
          if (distanceXZ(localPos, zombiePos) <= mutableZombie.explosionRadius) {
            reportPlayerDamageToServer?.(mutableZombie.damage)
          }
        }
      }
      if (mutableZombie.explosionTimer >= mutableZombie.explosionDuration) {
        removeExploderWarningRing(zombie)
        if (zombieData.networkId) {
          explodedZombieIds.delete(zombieData.networkId)
        }
        engine.removeEntity(zombie)
      }
      continue
    }

    if (rageShieldActive && mutableZombie.state !== ZombieState.SPAWNING && distanceXZ(zombiePos, playerPos) <= rageShieldRadius) {
      const zombieKey = zombieData.networkId || String(zombie)
      const lastShieldHitAt = lastRageShieldHitAtByZombieKey.get(zombieKey) ?? 0
      if (_gameTime - lastShieldHitAt >= rageShieldHitIntervalSec) {
        lastRageShieldHitAtByZombieKey.set(zombieKey, _gameTime)
        if (zombieData.networkId) {
          sendRageShieldHitRequest(zombieData.networkId)
        } else {
          damageZombie(zombie, getRageShieldContactDamage())
        }
      }
    }

    // Target: nearest brick within agro range, or nearest active match player
    const playerTarget = getNearestPlayerTarget(zombiePos, playerPos)
    let targetPos = Vector3.clone(playerTarget.position)
    const isExploder = zombieData.kind === ZombieKind.EXPLODER
    let targetIsBrick = false
    let targetBrickEntity: Entity | null = null
    let targetIsLocalPlayer = playerTarget.isLocalPlayer
    if (!isExploder) {
      let nearestBrickDist = BRICK_AGRO_RANGE + 1
      for (const { entity, position } of bricks) {
        const d = distanceXZ(zombiePos, position)
        if (d <= BRICK_AGRO_RANGE && d < nearestBrickDist) {
          nearestBrickDist = d
          targetPos = position
          targetIsBrick = true
          targetBrickEntity = entity
          targetIsLocalPlayer = false
        }
      }
    }

    const direction = Vector3.subtract(targetPos, zombiePos)
    direction.y = 0
    const distance = Vector3.length(direction)

    if (mutableZombie.state === ZombieState.SPAWNING) {
      mutableZombie.spawnTimer += dt
      if (mutableZombie.spawnTimer >= mutableZombie.spawnUpDuration) {
        mutableZombie.state = ZombieState.WALKING
        playZombieAnimation(
          zombie,
          isExploder ? ANIM_EXPLODER_CRAWL : ANIM_ZOMBIE_WALK,
          true,
          mutableZombie.walkAnimSpeed
        )
      }
      continue
    }

    // In attack range of current target (player or brick)
    if (distance <= mutableZombie.attackRange) {
      if (isExploder && !targetIsBrick) {
        if (zombieData.networkId) {
          requestNetworkZombieExplosion(zombie, zombieData.networkId)
        } else {
          commitZombieExplosion(zombie)
        }
        continue
      }

      if (mutableZombie.state !== ZombieState.ATTACKING) {
        mutableZombie.state = ZombieState.ATTACKING
        playZombieAnimation(zombie, ANIM_ZOMBIE_ATTACK, true)
      }
      mutableZombie.attackCooldown -= dt
      if (mutableZombie.attackCooldown <= 0) {
        mutableZombie.attackCooldown = 1
        if (targetIsBrick && targetBrickEntity != null) {
          const burstCenter = Vector3.create(targetPos.x, targetPos.y + 0.5, targetPos.z)
          spawnBloodAtPosition(burstCenter)
          damageBrick(targetBrickEntity, mutableZombie.damage)
        } else {
          if (targetIsLocalPlayer && rageShieldActive) {
            continue
          }
          const burstCenter = Vector3.create(targetPos.x, targetPos.y + 0.9, targetPos.z)
          spawnBloodAtPosition(burstCenter)
          if (targetIsLocalPlayer) {
            reportPlayerDamageToServer?.(mutableZombie.damage)
          }
        }
      }
      continue
    }

    if (mutableZombie.state === ZombieState.ATTACKING) {
      mutableZombie.state = ZombieState.WALKING
      playZombieAnimation(
        zombie,
        isExploder ? ANIM_EXPLODER_CRAWL : ANIM_ZOMBIE_WALK,
        true,
        mutableZombie.walkAnimSpeed
      )
    }

    // Move toward target
    const normalizedDir = Vector3.normalize(direction)
    const moveAmount = mutableZombie.speed * dt
    let newPos = Vector3.add(zombiePos, Vector3.scale(normalizedDir, moveAmount))
    newPos.y = zombiePos.y

    // Collision: do not move into any brick
    for (const { position } of bricks) {
      if (distanceXZ(newPos, position) <= BRICK_RADIUS) {
        newPos = Vector3.clone(zombiePos)
        break
      }
    }
    mutableTransform.position = newPos

    const lookRotation = Quaternion.lookRotation(normalizedDir)
    mutableTransform.rotation = lookRotation
  }
}
