import { engine, Entity, Material, MeshRenderer, PlayerIdentityData, Transform } from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import {
  getLobbyState,
  getLocalAddress,
  getPlayerCombatSnapshot,
  getPlayerPowerupSnapshot,
  isLocalReadyForMatch
} from './multiplayer/lobbyClient'
import { getServerTime } from './shared/timeSync'

const RAGE_AURA_BASE_SCALE = 2.4
const RAGE_AURA_PULSE_MIN = 0.92
const RAGE_AURA_PULSE_MAX = 1.08
const RAGE_AURA_HEIGHT_OFFSET = 1.0
const RAGE_AURA_EMISSIVE_INTENSITY_MIN = 0.5
const RAGE_AURA_EMISSIVE_INTENSITY_MAX = 1.2

const SPEED_PARTICLE_COUNT = 8
const SPEED_BASE_HEIGHT = 0.3
const SPEED_HEIGHT_STEP = 0.23
const SPEED_BASE_RADIUS = 0.22
const SPEED_RADIUS_STEP = 0.075
const SPEED_ROTATION_SPEED = 7.5
const SPEED_VERTICAL_WAVE = 0.05
const SPEED_BASE_SCALE = 0.11
const SPEED_SCALE_STEP = 0.014

type RemotePowerupEntry = {
  avatarEntity: Entity
  rageAuraEntity: Entity
  speedParticleEntities: Entity[]
}

type TransformData = ReturnType<typeof Transform.get>

function canShowArenaRemotePowerups(): boolean {
  const lobbyState = getLobbyState()
  const localAddress = getLocalAddress()
  if (!lobbyState || !localAddress) return false
  if (lobbyState.phase !== 'match_created') return false
  if (!isLocalReadyForMatch()) return false
  return lobbyState.arenaPlayers.some((player) => player.address.toLowerCase() === localAddress)
}

class ArenaRemotePowerups {
  private readonly entriesByAddress = new Map<string, RemotePowerupEntry>()

  constructor() {
    engine.addSystem(() => {
      this.syncRoster()
      this.updateEffects()
    }, undefined, 'arena-remote-powerups-system')
  }

  private syncRoster(): void {
    const lobbyState = getLobbyState()
    const localAddress = getLocalAddress()
    if (!canShowArenaRemotePowerups()) {
      for (const address of [...this.entriesByAddress.keys()]) {
        this.removeEntry(address)
      }
      return
    }

    const arenaAddresses = new Set((lobbyState?.arenaPlayers ?? []).map((player) => player.address.toLowerCase()))
    const visibleRemoteAddresses = new Set<string>()

    for (const [avatarEntity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
      const address = identity.address?.toLowerCase()
      if (!address || address === localAddress) continue

      const isDead = !!getPlayerCombatSnapshot(address)?.isDead
      if (!arenaAddresses.has(address) || isDead) {
        this.removeEntry(address)
        continue
      }

      visibleRemoteAddresses.add(address)

      const existing = this.entriesByAddress.get(address)
      if (existing) {
        existing.avatarEntity = avatarEntity
        continue
      }

      this.entriesByAddress.set(address, createRemotePowerupEntry(avatarEntity))
    }

    for (const address of [...this.entriesByAddress.keys()]) {
      if (!visibleRemoteAddresses.has(address)) {
        this.removeEntry(address)
      }
    }
  }

  private updateEffects(): void {
    const serverNowMs = getServerTime()
    const timeSeconds = serverNowMs / 1000

    for (const [address, entry] of this.entriesByAddress) {
      const avatarTransform = Transform.getOrNull(entry.avatarEntity)
      if (avatarTransform == null) continue

      const powerup = getPlayerPowerupSnapshot(address)
      updateRemoteRageAura(entry.rageAuraEntity, avatarTransform, powerup.rageShieldEndAtMs > serverNowMs, timeSeconds)
      updateRemoteSpeedAura(entry.speedParticleEntities, avatarTransform, powerup.speedEndAtMs > serverNowMs, timeSeconds)
    }
  }

  private removeEntry(address: string): void {
    const entry = this.entriesByAddress.get(address)
    if (!entry) return
    this.entriesByAddress.delete(address)
    engine.removeEntity(entry.rageAuraEntity)
    for (const particle of entry.speedParticleEntities) {
      engine.removeEntity(particle)
    }
  }
}

function createRemotePowerupEntry(avatarEntity: Entity): RemotePowerupEntry {
  const rageAuraEntity = engine.addEntity()
  Transform.create(rageAuraEntity, {
    position: Vector3.Zero(),
    rotation: Quaternion.Identity(),
    scale: Vector3.Zero()
  })
  MeshRenderer.setSphere(rageAuraEntity)
  Material.setPbrMaterial(rageAuraEntity, {
    albedoColor: Color4.create(0.95, 0.15, 0.2, 0.35),
    emissiveColor: Color3.create(1, 0.25, 0.3),
    emissiveIntensity: RAGE_AURA_EMISSIVE_INTENSITY_MAX,
    metallic: 0,
    roughness: 1
  })

  const speedParticleEntities: Entity[] = []
  for (let index = 0; index < SPEED_PARTICLE_COUNT; index += 1) {
    const particle = engine.addEntity()
    Transform.create(particle, {
      position: Vector3.Zero(),
      rotation: Quaternion.Identity(),
      scale: Vector3.Zero()
    })
    MeshRenderer.setSphere(particle)

    const brightness = 0.78 + index * 0.025
    Material.setPbrMaterial(particle, {
      albedoColor: Color4.create(1, 0.9 + index * 0.01, 0.3, 0.9),
      emissiveColor: Color3.create(1, brightness, 0.24),
      emissiveIntensity: 1.6 + index * 0.08,
      metallic: 0,
      roughness: 0.35
    })
    speedParticleEntities.push(particle)
  }

  return {
    avatarEntity,
    rageAuraEntity,
    speedParticleEntities
  }
}

function updateRemoteRageAura(
  entity: Entity,
  avatarTransform: TransformData,
  active: boolean,
  timeSeconds: number
): void {
  const transform = Transform.getMutable(entity)
  if (!active) {
    transform.scale = Vector3.Zero()
    return
  }

  const pulse = 0.5 + 0.5 * Math.sin(timeSeconds * 5)
  const scaleMul = RAGE_AURA_PULSE_MIN + (RAGE_AURA_PULSE_MAX - RAGE_AURA_PULSE_MIN) * pulse
  const scale = RAGE_AURA_BASE_SCALE * scaleMul
  const emissive =
    RAGE_AURA_EMISSIVE_INTENSITY_MIN +
    (RAGE_AURA_EMISSIVE_INTENSITY_MAX - RAGE_AURA_EMISSIVE_INTENSITY_MIN) * pulse

  transform.position = Vector3.add(avatarTransform.position, Vector3.create(0, RAGE_AURA_HEIGHT_OFFSET, 0))
  transform.rotation = avatarTransform.rotation
  transform.scale = Vector3.create(scale, scale, scale)
  const material = Material.getFlatMutableOrNull(entity)
  if (material) {
    material.emissiveIntensity = emissive
  }
}

function updateRemoteSpeedAura(
  particles: Entity[],
  avatarTransform: TransformData,
  active: boolean,
  timeSeconds: number
): void {
  if (!active) {
    for (const particle of particles) {
      Transform.getMutable(particle).scale = Vector3.Zero()
    }
    return
  }

  for (let index = 0; index < particles.length; index += 1) {
    const phase = index / particles.length
    const angle = timeSeconds * SPEED_ROTATION_SPEED + phase * Math.PI * 2
    const radius =
      SPEED_BASE_RADIUS +
      index * SPEED_RADIUS_STEP +
      0.03 * Math.sin(timeSeconds * 9 + index * 0.8)
    const height =
      SPEED_BASE_HEIGHT +
      index * SPEED_HEIGHT_STEP +
      SPEED_VERTICAL_WAVE * Math.sin(timeSeconds * 10 + index * 0.7)
    const scale = SPEED_BASE_SCALE + index * SPEED_SCALE_STEP
    const localOffset = Vector3.create(Math.cos(angle) * radius, height, Math.sin(angle) * radius)

    const transform = Transform.getMutable(particles[index])
    transform.position = Vector3.add(avatarTransform.position, Vector3.rotate(localOffset, avatarTransform.rotation))
    transform.rotation = Quaternion.Identity()
    transform.scale = Vector3.create(scale, scale, scale)
  }
}

let arenaRemotePowerups: ArenaRemotePowerups | null = null

export function initArenaRemotePowerups(): void {
  if (arenaRemotePowerups) return
  arenaRemotePowerups = new ArenaRemotePowerups()
}
