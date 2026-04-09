import { engine, Entity, GltfContainer, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { room } from './shared/messages'
import { getLobbyState, getLocalAddress, isLocalReadyForMatch } from './multiplayer/lobbyClient'
import { LobbyPhase } from './shared/lobbySchemas'
import { getServerTime } from './shared/timeSync'
import {
  LAVA_DAMAGE_INTERVAL_MS,
  LAVA_GRID_SIZE_X,
  LAVA_GRID_SIZE_Z,
  LAVA_MODEL_SRCS,
  LAVA_TILE_ACTIVE_SCALE_Y,
  LAVA_TILE_HIDDEN_SCALE_Y,
  LAVA_TILE_SCALE_XZ,
  LAVA_TILE_WARNING_SCALE_Y,
  getLavaGridCoordsFromWorld,
  getLavaTileKey,
  getLavaWorldPosition
} from './shared/lavaHazardConfig'

type LocalLavaZone = {
  entity: Entity
  gridX: number
  gridZ: number
  lavaId: string | null
  modelVariant: number
  rotationQuarterTurns: number
  warningAtMs: number
  activeAtMs: number
  expiresAtMs: number
}

const HIDDEN_POSITION_Y = -3

const localLavaZoneByKey = new Map<string, LocalLavaZone>()
const localLavaTileKeyById = new Map<string, string>()
let isLavaSyncInitialized = false
let areLavaZonesInitialized = false
let lastLavaDamageRequestAtMs = 0

function getZoneModelVariant(gridX: number, gridZ: number): number {
  return Math.abs(gridX * 17 + gridZ * 31) % LAVA_MODEL_SRCS.length
}

function getZoneRotationQuarterTurns(_gridX: number, _gridZ: number): number {
  return 0
}

function getZoneHiddenPosition(gridX: number, gridZ: number): Vector3 {
  const visiblePosition = getLavaWorldPosition(gridX, gridZ, LAVA_TILE_HIDDEN_SCALE_Y)
  return Vector3.create(visiblePosition.x, HIDDEN_POSITION_Y, visiblePosition.z)
}

function hideZone(zone: LocalLavaZone): void {
  if (!Transform.has(zone.entity)) return
  const mutableTransform = Transform.getMutable(zone.entity)
  mutableTransform.position = getZoneHiddenPosition(zone.gridX, zone.gridZ)
  mutableTransform.scale = Vector3.create(LAVA_TILE_SCALE_XZ, LAVA_TILE_HIDDEN_SCALE_Y, LAVA_TILE_SCALE_XZ)
}

function initializeLavaZones(): void {
  if (areLavaZonesInitialized) return
  areLavaZonesInitialized = true

  for (let gridX = 0; gridX < LAVA_GRID_SIZE_X; gridX += 1) {
    for (let gridZ = 0; gridZ < LAVA_GRID_SIZE_Z; gridZ += 1) {
      const modelVariant = getZoneModelVariant(gridX, gridZ)
      const rotationQuarterTurns = getZoneRotationQuarterTurns(gridX, gridZ)
      const entity = engine.addEntity()

      Transform.create(entity, {
        position: getZoneHiddenPosition(gridX, gridZ),
        rotation: Quaternion.fromEulerDegrees(0, rotationQuarterTurns * 90, 0),
        scale: Vector3.create(LAVA_TILE_SCALE_XZ, LAVA_TILE_HIDDEN_SCALE_Y, LAVA_TILE_SCALE_XZ)
      })
      GltfContainer.create(entity, {
        src: LAVA_MODEL_SRCS[modelVariant],
        visibleMeshesCollisionMask: 0,
        invisibleMeshesCollisionMask: 0
      })

      localLavaZoneByKey.set(getLavaTileKey(gridX, gridZ), {
        entity,
        gridX,
        gridZ,
        lavaId: null,
        modelVariant,
        rotationQuarterTurns,
        warningAtMs: 0,
        activeAtMs: 0,
        expiresAtMs: 0
      })
    }
  }
}

function clearZoneState(zone: LocalLavaZone): void {
  if (zone.lavaId) {
    localLavaTileKeyById.delete(zone.lavaId)
  }
  zone.lavaId = null
  zone.warningAtMs = 0
  zone.activeAtMs = 0
  zone.expiresAtMs = 0
  hideZone(zone)
}

function clearAllLavaHazards(): void {
  lastLavaDamageRequestAtMs = 0
  for (const zone of localLavaZoneByKey.values()) {
    clearZoneState(zone)
  }
  localLavaTileKeyById.clear()
}

function removeLavaHazardById(lavaId: string): void {
  const zoneKey = localLavaTileKeyById.get(lavaId)
  if (!zoneKey) return
  const zone = localLavaZoneByKey.get(zoneKey)
  if (!zone || zone.lavaId !== lavaId) {
    localLavaTileKeyById.delete(lavaId)
    return
  }
  clearZoneState(zone)
}

function isLocalPlayerInCurrentMatch(): boolean {
  const lobbyState = getLobbyState()
  const localAddress = getLocalAddress()
  if (!lobbyState || !localAddress) return false
  if (lobbyState.phase !== LobbyPhase.MATCH_CREATED) return false
  if (!isLocalReadyForMatch()) return false
  return lobbyState.arenaPlayers.some((player) => player.address === localAddress)
}

function upsertLocalLavaHazard(data: {
  lavaId: string
  gridX: number
  gridZ: number
  modelVariant: number
  rotationQuarterTurns: number
  warningAtMs: number
  activeAtMs: number
  expiresAtMs: number
}): void {
  const zone = localLavaZoneByKey.get(getLavaTileKey(data.gridX, data.gridZ))
  if (!zone) return

  if (zone.lavaId && zone.lavaId !== data.lavaId) {
    localLavaTileKeyById.delete(zone.lavaId)
  }

  zone.lavaId = data.lavaId
  zone.warningAtMs = data.warningAtMs
  zone.activeAtMs = data.activeAtMs
  zone.expiresAtMs = data.expiresAtMs
  localLavaTileKeyById.set(data.lavaId, getLavaTileKey(data.gridX, data.gridZ))
}

function getZoneScaleY(now: number, zone: LocalLavaZone): number {
  const pulseSeed = zone.gridX * 0.7 + zone.gridZ * 0.45
  if (now >= zone.activeAtMs) {
    const activePulse = Math.sin(now * 0.01 + pulseSeed)
    return LAVA_TILE_ACTIVE_SCALE_Y + activePulse * 0.01
  }

  const warningDuration = Math.max(1, zone.activeAtMs - zone.warningAtMs)
  const warningProgress = Math.max(0, Math.min(1, (now - zone.warningAtMs) / warningDuration))
  const warningPulse = Math.sin(now * 0.016 + pulseSeed)
  return LAVA_TILE_WARNING_SCALE_Y + warningProgress * 0.014 + (warningPulse + 1) * 0.004
}

function updateZoneVisual(zone: LocalLavaZone, now: number): void {
  if (!zone.lavaId || now < zone.warningAtMs || now >= zone.expiresAtMs) {
    hideZone(zone)
    return
  }

  if (!Transform.has(zone.entity)) return
  const scaleY = getZoneScaleY(now, zone)
  const mutableTransform = Transform.getMutable(zone.entity)
  mutableTransform.position = getLavaWorldPosition(zone.gridX, zone.gridZ, scaleY)
  mutableTransform.scale = Vector3.create(LAVA_TILE_SCALE_XZ, scaleY, LAVA_TILE_SCALE_XZ)
}

export function initLavaHazardClient(): void {
  if (isLavaSyncInitialized) return
  isLavaSyncInitialized = true
  initializeLavaZones()

  room.onMessage('lavaHazardsSpawned', (data) => {
    if (!isLocalPlayerInCurrentMatch()) return
    for (const lava of data.hazards) {
      upsertLocalLavaHazard(lava)
    }
  })

  room.onMessage('lavaHazardsExpired', (data) => {
    for (const lavaId of data.lavaIds) {
      removeLavaHazardById(lavaId)
    }
  })

  room.onMessage('lavaHazardsCleared', () => {
    clearAllLavaHazards()
  })
}

export function lavaHazardSystem(): void {
  if (!areLavaZonesInitialized) return

  if (!isLocalPlayerInCurrentMatch()) {
    clearAllLavaHazards()
    return
  }

  const now = getServerTime()
  for (const zone of localLavaZoneByKey.values()) {
    updateZoneVisual(zone, now)
  }

  if (!Transform.has(engine.PlayerEntity)) return
  if (now - lastLavaDamageRequestAtMs < LAVA_DAMAGE_INTERVAL_MS) return

  const playerPosition = Transform.get(engine.PlayerEntity).position
  const tileCoords = getLavaGridCoordsFromWorld(playerPosition.x, playerPosition.z)
  if (!tileCoords) return

  const zone = localLavaZoneByKey.get(getLavaTileKey(tileCoords.gridX, tileCoords.gridZ))
  if (!zone?.lavaId) return
  if (now < zone.activeAtMs || now >= zone.expiresAtMs) return

  lastLavaDamageRequestAtMs = now
  void room.send('lavaHazardDamageRequest', { lavaId: zone.lavaId })
}
