import {
  engine,
  Entity,
  Transform,
  GltfContainer,
  Animator,
  MeshRenderer,
  Material,
  Schemas
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4, Color3 } from '@dcl/sdk/math'
import { damagePlayer, setDeathTime } from './playerHealth'

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
  health: Schemas.Number
}

export const ZombieComponent = engine.defineComponent('ZombieComponent', ZombieComponentSchema, {
  state: ZombieState.SPAWNING,
  spawnTimer: 0,
  attackRange: 1.2,
  attackCooldown: 0,
  health: 2
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

function getRandomSpawnPosition(): Vector3 {
  const x = SPAWN_MIN_X + Math.random() * (SPAWN_MAX_X - SPAWN_MIN_X)
  const z = SPAWN_MIN_Z + Math.random() * (SPAWN_MAX_Z - SPAWN_MIN_Z)
  return Vector3.create(x, 0, z)
}

function playZombieAnimation(entity: Entity, clip: string, loop: boolean) {
  if (!Animator.has(entity)) return
  const animator = Animator.getMutable(entity)
  for (const state of animator.states) {
    const isActive = state.clip === clip
    state.playing = isActive
    state.loop = isActive ? loop : false
  }
}

export function spawnZombie(): Entity {
  const zombie = engine.addEntity()

  const spawnPos = getRandomSpawnPosition()

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
    health: 2
  })

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

/** Apply damage to a zombie. Returns true if zombie died. Spawns blood burst on hit and on death. */
export function damageZombie(entity: Entity, amount: number): boolean {
  if (!ZombieComponent.has(entity)) return false
  const zombie = ZombieComponent.getMutable(entity)
  zombie.health -= amount

  const pos = Transform.get(entity).position
  const burstCenter = Vector3.create(pos.x, pos.y + 0.9, pos.z)

  if (zombie.health <= 0) {
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

export function zombieSystem(dt: number) {
  if (!Transform.has(engine.PlayerEntity)) return

  const playerPos = Transform.get(engine.PlayerEntity).position

  for (const [zombie, zombieData, transform] of engine.getEntitiesWith(
    ZombieComponent,
    Transform,
    GltfContainer,
    Animator
  )) {
    const mutableZombie = ZombieComponent.getMutable(zombie)
    const mutableTransform = Transform.getMutable(zombie)

    const zombiePos = transform.position
    const direction = Vector3.subtract(playerPos, zombiePos)
    direction.y = 0
    const distance = Vector3.length(direction)

    if (mutableZombie.state === ZombieState.SPAWNING) {
      mutableZombie.spawnTimer += dt
      if (mutableZombie.spawnTimer >= ZOMBIE_UP_DURATION) {
        mutableZombie.state = ZombieState.WALKING
        playZombieAnimation(zombie, ANIM_ZOMBIE_WALK, true)
      }
      continue
    }

    if (distance <= mutableZombie.attackRange) {
      if (mutableZombie.state !== ZombieState.ATTACKING) {
        mutableZombie.state = ZombieState.ATTACKING
        playZombieAnimation(zombie, ANIM_ZOMBIE_ATTACK, true)
      }
      // Attack player every 0.3 seconds
      mutableZombie.attackCooldown -= dt
      if (mutableZombie.attackCooldown <= 0) {
        mutableZombie.attackCooldown = 1
        // Spawn blood at player (chest height) then deal damage
        const burstCenter = Vector3.create(playerPos.x, playerPos.y + 0.9, playerPos.z)
        spawnBloodAtPosition(burstCenter)
        if (damagePlayer(1)) {
          setDeathTime(_gameTime)
        }
      }
      continue
    }

    if (mutableZombie.state === ZombieState.ATTACKING) {
      mutableZombie.state = ZombieState.WALKING
      playZombieAnimation(zombie, ANIM_ZOMBIE_WALK, true)
    }

    // Move toward player
    const normalizedDir = Vector3.normalize(direction)
    const moveAmount = ZOMBIE_SPEED * dt
    const newPos = Vector3.add(zombiePos, Vector3.scale(normalizedDir, moveAmount))
    newPos.y = zombiePos.y
    mutableTransform.position = newPos

    // Face the player
    const lookRotation = Quaternion.lookRotation(normalizedDir)
    mutableTransform.rotation = lookRotation
  }
}
