import {
  engine,
  Entity,
  Transform,
  AudioSource,
  GltfContainer,
  Animator,
  MeshRenderer,
  Material,
  Schemas
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4, Color3 } from '@dcl/sdk/math'
import { damagePlayer, setDeathTime } from './playerHealth'
import { getBricks, damageBrick, BRICK_RADIUS } from './brick'
import { createHealthBarForZombie } from './healthBar'
import { tryDropPotions } from './potions'

// Animation clip names from Zombie.glb
const ANIM_ZOMBIE_UP = 'ZombieUP'
const ANIM_ZOMBIE_WALK = 'ZombieWalk'
const ANIM_ZOMBIE_ATTACK = 'ZombieAttack'

// Zombie state
export enum ZombieState {
  SPAWNING = 'spawning',
  WALKING = 'walking',
  ATTACKING = 'attacking'
}

// Custom component for zombie behavior
const ZombieComponentSchema = {
  state: Schemas.EnumString<ZombieState>(ZombieState, ZombieState.SPAWNING),
  spawnTimer: Schemas.Number,
  attackRange: Schemas.Number,
  attackCooldown: Schemas.Number,
  health: Schemas.Number,
  speed: Schemas.Number,
  walkAnimSpeed: Schemas.Number,
  spawnUpDuration: Schemas.Number,
  networkId: Schemas.String
}

export const ZombieComponent = engine.defineComponent('ZombieComponent', ZombieComponentSchema, {
  state: ZombieState.SPAWNING,
  spawnTimer: 0,
  attackRange: 1.2,
  attackCooldown: 0,
  health: 3,
  speed: 1.5,
  walkAnimSpeed: 1,
  spawnUpDuration: 1.2,
  networkId: ''
})

// Blood burst particles: fly outward and get removed when endTime is reached
const BloodParticleSchema = {
  velocity: Schemas.Vector3,
  endTime: Schemas.Number
}
const BloodParticleComponent = engine.defineComponent('BloodParticleComponent', BloodParticleSchema)

let _gameTime = 0
export function getGameTime(): number {
  return _gameTime
}

// Scene bounds for random spawn (inside the walls, avoid edges)
const SPAWN_MIN_X = 10
const SPAWN_MAX_X = 54
const SPAWN_MIN_Z = 10
const SPAWN_MAX_Z = 54

const ZOMBIE_SPEED = 1.5
const ZOMBIE_UP_DURATION = 1.2 // Approximate ZombieUP animation length in seconds
// When a zombie is within this range of a brick, it targets the brick instead of the player
const BRICK_AGRO_RANGE = 2.5
const ZOMBIE_DEATH_SOUND_URL = 'assets/sounds/alex_jauk-zombie-screaming-207590.mp3'

type SpawnZombieOptions = {
  position?: Vector3
  networkId?: string
}

let reportServerZombieDeath: ((zombieId: string) => void) | null = null
let zombieDeathSoundEntity: Entity | null = null
export function setZombieDeathReporter(reporter: ((zombieId: string) => void) | null): void {
  reportServerZombieDeath = reporter
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
  const x = SPAWN_MIN_X + Math.random() * (SPAWN_MAX_X - SPAWN_MIN_X)
  const z = SPAWN_MIN_Z + Math.random() * (SPAWN_MAX_Z - SPAWN_MIN_Z)
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

export function spawnZombie(options?: SpawnZombieOptions): Entity {
  const zombie = engine.addEntity()

  const spawnPos = options?.position ? Vector3.clone(options.position) : getRandomSpawnPosition()

  Transform.create(zombie, {
    position: spawnPos,
    rotation: Quaternion.Identity(),
    scale: Vector3.One()
  })

  // Use ZombieBasic model (same as scene item; has collider setup in composite)
  GltfContainer.create(zombie, {
    src: 'assets/custom/zombiebasic/Zombie.glb',
    visibleMeshesCollisionMask: 0,
    invisibleMeshesCollisionMask: 0
  })

  // Animator with all three animation states - start with ZombieUP
  Animator.create(zombie, {
    states: [
      { clip: ANIM_ZOMBIE_UP, playing: true, loop: false, speed: 1 },
      { clip: ANIM_ZOMBIE_WALK, playing: false, loop: true, speed: 1 },
      { clip: ANIM_ZOMBIE_ATTACK, playing: false, loop: true, speed: 1 }
    ]
  })

  ZombieComponent.create(zombie, {
    state: ZombieState.SPAWNING,
    spawnTimer: 0,
    attackRange: 1.2,
    attackCooldown: 0,
    health: 3,
    speed: ZOMBIE_SPEED,
    walkAnimSpeed: 1,
    spawnUpDuration: ZOMBIE_UP_DURATION,
    networkId: options?.networkId ?? ''
  })

  createHealthBarForZombie(zombie, 3) // default height
  return zombie
}

/** Quick zombie: ZombieYellow.glb, faster movement, 2 HP. */
export function spawnQuickZombie(options?: SpawnZombieOptions): Entity {
  const zombie = engine.addEntity()
  const spawnPos = options?.position ? Vector3.clone(options.position) : getRandomSpawnPosition()

  Transform.create(zombie, {
    position: spawnPos,
    rotation: Quaternion.Identity(),
    scale: Vector3.One()
  })

  GltfContainer.create(zombie, {
    src: 'assets/scene/Models/ZombieYellow/ZombieYellow.glb',
    visibleMeshesCollisionMask: 0,
    invisibleMeshesCollisionMask: 0
  })

  const quickSpeed = 2.6
  const quickWalkAnimSpeed = 1.7

  Animator.create(zombie, {
    states: [
      { clip: ANIM_ZOMBIE_UP, playing: true, loop: false, speed: 1 },
      { clip: ANIM_ZOMBIE_WALK, playing: false, loop: true, speed: quickWalkAnimSpeed },
      { clip: ANIM_ZOMBIE_ATTACK, playing: false, loop: true, speed: 1 }
    ]
  })

  ZombieComponent.create(zombie, {
    state: ZombieState.SPAWNING,
    spawnTimer: 0,
    attackRange: 1.2,
    attackCooldown: 0,
    health: 2,
    speed: quickSpeed,
    walkAnimSpeed: quickWalkAnimSpeed,
    spawnUpDuration: ZOMBIE_UP_DURATION,
    networkId: options?.networkId ?? ''
  })

  createHealthBarForZombie(zombie, 2, 1.55) // a bit lower
  return zombie
}

/** Tank zombie: ZombiePurple.glb, slower movement, 10 HP. */
export function spawnTankZombie(options?: SpawnZombieOptions): Entity {
  const zombie = engine.addEntity()
  const spawnPos = options?.position ? Vector3.clone(options.position) : getRandomSpawnPosition()

  Transform.create(zombie, {
    position: spawnPos,
    rotation: Quaternion.Identity(),
    scale: Vector3.One()
  })

  GltfContainer.create(zombie, {
    src: 'assets/scene/Models/ZombiePurple/ZombiePurple.glb',
    visibleMeshesCollisionMask: 0,
    invisibleMeshesCollisionMask: 0
  })

  const tankSpeed = 0.75
  const tankWalkAnimSpeed = 0.6

  Animator.create(zombie, {
    states: [
      { clip: ANIM_ZOMBIE_UP, playing: true, loop: false, speed: 1 },
      { clip: ANIM_ZOMBIE_WALK, playing: false, loop: true, speed: tankWalkAnimSpeed },
      { clip: ANIM_ZOMBIE_ATTACK, playing: false, loop: true, speed: 1 }
    ]
  })

  ZombieComponent.create(zombie, {
    state: ZombieState.SPAWNING,
    spawnTimer: 0,
    attackRange: 1.2,
    attackCooldown: 0,
    health: 10,
    speed: tankSpeed,
    walkAnimSpeed: tankWalkAnimSpeed,
    spawnUpDuration: ZOMBIE_UP_DURATION,
    networkId: options?.networkId ?? ''
  })

  createHealthBarForZombie(zombie, 10, 2.75) // a bit higher
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
    toRemove.push(entity)
  }
  for (const e of toRemove) engine.removeEntity(e)
}

export function despawnZombieByNetworkId(zombieId: string): boolean {
  for (const [entity, zombieData] of engine.getEntitiesWith(ZombieComponent)) {
    if (zombieData.networkId === zombieId) {
      playZombieDeathSound()
      engine.removeEntity(entity)
      return true
    }
  }
  return false
}

/** Apply damage to a zombie. Returns true if zombie died. Spawns blood burst on hit and on death. */
export function damageZombie(entity: Entity, amount: number): boolean {
  if (!ZombieComponent.has(entity)) return false
  const zombie = ZombieComponent.getMutable(entity)
  zombie.health -= amount

  const pos = Transform.get(entity).position
  const burstCenter = Vector3.create(pos.x, pos.y + 0.9, pos.z)

  if (zombie.health <= 0) {
    playZombieDeathSound()
    if (zombie.networkId) {
      reportServerZombieDeath?.(zombie.networkId)
    }
    spawnBloodBurst(burstCenter, DEATH_BURST_COUNT, DEATH_BURST_SPEED, BLOOD_BURST_DURATION, DEATH_BURST_SCALE)
    tryDropPotions(Vector3.create(pos.x, pos.y, pos.z))
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

function distanceXZ(a: Vector3, b: Vector3): number {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dz * dz)
}

export function zombieSystem(dt: number) {
  if (!Transform.has(engine.PlayerEntity)) return

  const playerPos = Transform.get(engine.PlayerEntity).position
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

    // Target: nearest brick within agro range, or player
    let targetPos = Vector3.clone(playerPos)
    let targetIsBrick = false
    let targetBrickEntity: Entity | null = null
    let nearestBrickDist = BRICK_AGRO_RANGE + 1
    for (const { entity, position } of bricks) {
      const d = distanceXZ(zombiePos, position)
      if (d <= BRICK_AGRO_RANGE && d < nearestBrickDist) {
        nearestBrickDist = d
        targetPos = position
        targetIsBrick = true
        targetBrickEntity = entity
      }
    }

    const direction = Vector3.subtract(targetPos, zombiePos)
    direction.y = 0
    const distance = Vector3.length(direction)

    if (mutableZombie.state === ZombieState.SPAWNING) {
      mutableZombie.spawnTimer += dt
      if (mutableZombie.spawnTimer >= mutableZombie.spawnUpDuration) {
        mutableZombie.state = ZombieState.WALKING
        playZombieAnimation(zombie, ANIM_ZOMBIE_WALK, true, mutableZombie.walkAnimSpeed)
      }
      continue
    }

    // In attack range of current target (player or brick)
    if (distance <= mutableZombie.attackRange) {
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
          damageBrick(targetBrickEntity, 1)
        } else {
          const burstCenter = Vector3.create(playerPos.x, playerPos.y + 0.9, playerPos.z)
          spawnBloodAtPosition(burstCenter)
          if (damagePlayer(1)) {
            setDeathTime(_gameTime)
          }
        }
      }
      continue
    }

    if (mutableZombie.state === ZombieState.ATTACKING) {
      mutableZombie.state = ZombieState.WALKING
      playZombieAnimation(zombie, ANIM_ZOMBIE_WALK, true, mutableZombie.walkAnimSpeed)
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
