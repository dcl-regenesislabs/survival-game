import {
  engine,
  Entity,
  Transform,
  MeshRenderer,
  Material,
  PlayerIdentityData,
  Schemas
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4, Color3 } from '@dcl/sdk/math'
import { ZombieComponent, getGameTime } from './zombie'
import { getPlayerHp, MAX_HP, getHealGlowEndTime } from './playerHealth'
import { getLocalAddress, getLobbyState, getPlayerCombatSnapshot, isLocalReadyForMatch } from './multiplayer/lobbyClient'

const HealthBarSchema = {
  parent: Schemas.Entity,
  maxHp: Schemas.Number,
  isPlayer: Schemas.Boolean,
  playerAddress: Schemas.String,
  /** Height above parent feet (y offset). */
  heightOffset: Schemas.Number,
  lastStyleVariant: Schemas.Number
}
const HealthBarComponent = engine.defineComponent('HealthBarComponent', HealthBarSchema)

const BAR_WIDTH = 0.8
const BAR_HEIGHT = 0.14
const BAR_DEPTH = 0.1
/** Rotation smoothing: higher = snappier, lower = smoother. ~3–4 for a gentle, non-poppy feel. */
const BILLBOARD_SMOOTH_SPEED = 3.5
/** Default height above feet for regular zombies. */
const HEIGHT_DEFAULT = 1.9
/** Player bar: higher and larger than zombie bars. */
const HEIGHT_PLAYER = 2.5
const PLAYER_BAR_WIDTH = 1.2
const PLAYER_BAR_HEIGHT = 0.2
const PLAYER_BAR_DEPTH = 0.16
const remotePlayerBarByAddress = new Map<string, Entity>()

function canShowArenaPlayerBars(): boolean {
  const localAddress = getLocalAddress()
  const lobby = getLobbyState()
  if (!localAddress || !lobby) return false
  if (lobby.phase !== 'match_created') return false
  if (!isLocalReadyForMatch()) return false
  return lobby.arenaPlayers.some((player) => player.address.toLowerCase() === localAddress)
}

function removeRemotePlayerBar(address: string): void {
  const normalized = address.toLowerCase()
  const barEntity = remotePlayerBarByAddress.get(normalized)
  if (barEntity !== undefined) {
    engine.removeEntity(barEntity)
    remotePlayerBarByAddress.delete(normalized)
  }
}

function getHealthColor(ratio: number): { albedo: Color4; emissive: Color3 } {
  if (ratio > 0.6) {
    return {
      albedo: Color4.create(0.2, 0.75, 0.2, 0.95),
      emissive: Color3.create(0.15, 0.5, 0.15)
    }
  }
  if (ratio > 0.33) {
    return {
      albedo: Color4.create(0.9, 0.75, 0.1, 0.95),
      emissive: Color3.create(0.5, 0.4, 0.05)
    }
  }
  return {
    albedo: Color4.create(0.85, 0.15, 0.1, 0.95),
    emissive: Color3.create(0.5, 0.08, 0.05)
  }
}

/** Create a billboard health bar above a zombie. heightOffset: regular 1.9, quick lower (e.g. 1.75), tank higher (e.g. 2.05). */
export function createHealthBarForZombie(zombie: Entity, maxHp: number, heightOffset: number = HEIGHT_DEFAULT): Entity {
  const bar = engine.addEntity()
  Transform.create(bar, {
    position: Vector3.create(0, heightOffset, 0),
    rotation: Quaternion.Identity(),
    scale: Vector3.create(BAR_WIDTH, BAR_HEIGHT, BAR_DEPTH)
  })
  MeshRenderer.setBox(bar)
  Material.setPbrMaterial(bar, {
    ...getHealthColor(1),
    emissiveIntensity: 0.25,
    metallic: 0,
    roughness: 0.9
  })
  HealthBarComponent.create(bar, {
    parent: zombie,
    maxHp,
    isPlayer: false,
    playerAddress: '',
    heightOffset,
    lastStyleVariant: -1
  })
  return bar
}

/** Create a player's 3D health bar. */
export function createHealthBarForPlayer(): Entity {
  return createHealthBarForPlayerEntity(engine.PlayerEntity, getLocalAddress())
}

function createHealthBarForPlayerEntity(playerEntity: Entity, playerAddress: string): Entity {
  const bar = engine.addEntity()
  Transform.create(bar, {
    position: Vector3.create(0, HEIGHT_PLAYER, 0),
    rotation: Quaternion.Identity(),
    scale: Vector3.create(PLAYER_BAR_WIDTH, PLAYER_BAR_HEIGHT, PLAYER_BAR_DEPTH)
  })
  MeshRenderer.setBox(bar)
  Material.setPbrMaterial(bar, {
    ...getHealthColor(1),
    emissiveIntensity: 0.25,
    metallic: 0,
    roughness: 0.9
  })
  HealthBarComponent.create(bar, {
    parent: playerEntity,
    maxHp: MAX_HP,
    isPlayer: true,
    playerAddress: playerAddress.toLowerCase(),
    heightOffset: HEIGHT_PLAYER,
    lastStyleVariant: -1
  })
  return bar
}

/** Remove all health bars (e.g. when resetting). */
export function removeAllHealthBars(): void {
  const toRemove: Entity[] = []
  for (const [entity] of engine.getEntitiesWith(HealthBarComponent)) {
    toRemove.push(entity)
  }
  for (const e of toRemove) engine.removeEntity(e)
  remotePlayerBarByAddress.clear()
}

function syncRemotePlayerHealthBars(): void {
  const localAddress = getLocalAddress()
  const lobby = getLobbyState()
  const shouldShowTeammateBars = !!localAddress && !!lobby && canShowArenaPlayerBars()

  const expectedAddresses = new Set<string>()
  if (shouldShowTeammateBars) {
    for (const player of lobby!.arenaPlayers) {
      const address = player.address.toLowerCase()
      if (!address || address === localAddress) continue
      expectedAddresses.add(address)
    }
  }

  for (const [address, barEntity] of remotePlayerBarByAddress) {
    if (expectedAddresses.has(address) && HealthBarComponent.has(barEntity)) continue
    removeRemotePlayerBar(address)
  }

  if (!shouldShowTeammateBars) return

  for (const [playerEntity, identity] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
    const address = identity.address.toLowerCase()
    if (!expectedAddresses.has(address)) continue
    if (remotePlayerBarByAddress.has(address)) continue
    remotePlayerBarByAddress.set(address, createHealthBarForPlayerEntity(playerEntity, address))
  }
}

function healthBarSystem(dt: number) {
  if (!Transform.has(engine.CameraEntity)) return

  syncRemotePlayerHealthBars()

  const cameraPos = Transform.get(engine.CameraEntity).position
  const smoothFactor = 1 - Math.exp(-BILLBOARD_SMOOTH_SPEED * dt)
  const toRemove: Entity[] = []
  const localAddress = getLocalAddress()

  for (const [barEntity, barData, barTransform] of engine.getEntitiesWith(
    HealthBarComponent,
    Transform,
    MeshRenderer
  )) {
    const { parent, maxHp, isPlayer, heightOffset } = barData

    if (isPlayer) {
      if (!Transform.has(parent)) {
        if (barData.playerAddress) removeRemotePlayerBar(barData.playerAddress)
        else toRemove.push(barEntity)
        continue
      }
      if (barData.playerAddress) {
        const identity = PlayerIdentityData.getOrNull(parent)
        if (!identity || identity.address.toLowerCase() !== barData.playerAddress) {
          removeRemotePlayerBar(barData.playerAddress)
          continue
        }
      }
    } else {
      if (!ZombieComponent.has(parent)) {
        toRemove.push(barEntity)
        continue
      }
    }

    let currentHp = 0
    let playerIsDead = false
    if (isPlayer) {
      const isLocalPlayerBar = !barData.playerAddress || barData.playerAddress === localAddress
      if (isLocalPlayerBar) {
        currentHp = getPlayerHp()
      } else {
        const snapshot = getPlayerCombatSnapshot(barData.playerAddress)
        currentHp = snapshot?.hp ?? MAX_HP
        playerIsDead = snapshot?.isDead ?? false
      }
    } else {
      currentHp = ZombieComponent.get(parent).health
    }
    if (isPlayer && playerIsDead) {
      if (barData.playerAddress) removeRemotePlayerBar(barData.playerAddress)
      else toRemove.push(barEntity)
      continue
    }
    const ratio = Math.max(0, Math.min(1, currentHp / maxHp))

    const parentPos = Transform.get(parent).position
    const barWorldPos = Vector3.create(
      parentPos.x,
      parentPos.y + heightOffset,
      parentPos.z
    )

    const dirToCamera = Vector3.subtract(cameraPos, barWorldPos)
    dirToCamera.y = 0
    const lenXZ = Math.sqrt(dirToCamera.x * dirToCamera.x + dirToCamera.z * dirToCamera.z)
    if (lenXZ < 0.001) continue
    const forward = Vector3.normalize(dirToCamera)
    const lookRotWorld = Quaternion.lookRotation(forward)

    const mutableTransform = Transform.getMutable(barEntity)
    mutableTransform.position = barWorldPos
    const currentRot = barTransform.rotation
    mutableTransform.rotation = Quaternion.slerp(currentRot, lookRotWorld, smoothFactor)
    const width = isPlayer ? PLAYER_BAR_WIDTH : BAR_WIDTH
    const height = isPlayer ? PLAYER_BAR_HEIGHT : BAR_HEIGHT
    const depth = isPlayer ? PLAYER_BAR_DEPTH : BAR_DEPTH
    const fillWidth = Math.max(0.02, width * ratio)
    mutableTransform.scale = Vector3.create(fillWidth, height, depth)

    let colors = getHealthColor(ratio)
    let emissiveIntensity = 0.25
    let styleVariant = ratio > 0.6 ? 0 : ratio > 0.33 ? 1 : 2
    if (isPlayer && (!barData.playerAddress || barData.playerAddress === localAddress) && getGameTime() < getHealGlowEndTime()) {
      const glowPhase = (getGameTime() * 4) % (2 * Math.PI)
      const pulse = 0.5 + 0.5 * Math.sin(glowPhase)
      emissiveIntensity = 0.4 + pulse * 0.5
      styleVariant = 3
      colors = {
        albedo: Color4.create(0.2, 1, 0.35, 0.95),
        emissive: Color3.create(0.2, 1, 0.3)
      }
    }
    if (barData.lastStyleVariant !== styleVariant || styleVariant === 3) {
      Material.setPbrMaterial(barEntity, {
        albedoColor: colors.albedo,
        emissiveColor: colors.emissive,
        emissiveIntensity,
        metallic: 0,
        roughness: 0.9
      })
      HealthBarComponent.getMutable(barEntity).lastStyleVariant = styleVariant
    }
  }

  for (const e of toRemove) engine.removeEntity(e)
}

export function initHealthBarSystem(): void {
  engine.addSystem(healthBarSystem)
}
