import {
  AvatarModifierArea,
  AvatarModifierType,
  engine,
  Entity,
  PlayerIdentityData,
  Transform
} from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { getLobbyState, getLocalAddress, getPlayerCombatSnapshot } from './multiplayer/lobbyClient'

const FAR_AWAY = Vector3.create(10000, 10000, 10000)
const HIDE_AREA_SIZE = Vector3.create(1.6, 1.2, 1.6)
const HIDE_AREA_CENTER_Y_OFFSET = 1.8

type HideEntry = {
  areaEntity: Entity
  isActive: boolean
  lastKnownPosition: Vector3
}

const hideEntriesByAddress = new Map<string, HideEntry>()
let initialized = false

function createHideEntry(): HideEntry {
  const areaEntity = engine.addEntity()
  Transform.create(areaEntity, {
    position: FAR_AWAY,
    rotation: Quaternion.Identity(),
    scale: Vector3.One()
  })
  AvatarModifierArea.create(areaEntity, {
    area: HIDE_AREA_SIZE,
    modifiers: [AvatarModifierType.AMT_HIDE_AVATARS],
    excludeIds: []
  })
  return {
    areaEntity,
    isActive: false,
    lastKnownPosition: Vector3.create(0, 0, 0)
  }
}

function getOrCreateHideEntry(address: string): HideEntry {
  const normalized = address.toLowerCase()
  const cached = hideEntriesByAddress.get(normalized)
  if (cached) return cached
  const created = createHideEntry()
  hideEntriesByAddress.set(normalized, created)
  return created
}

function getPlayerPositionByAddress(address: string): Vector3 | null {
  const normalized = address.toLowerCase()
  for (const [entity, identity, transform] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
    if (identity.address.toLowerCase() !== normalized) continue
    return Vector3.clone(transform.position)
  }
  return null
}

function getExcludeIdsForTarget(targetAddress: string): string[] {
  const normalizedTarget = targetAddress.toLowerCase()
  const lobby = getLobbyState()
  if (!lobby?.arenaPlayers.length) return []
  return lobby.arenaPlayers
    .map((player) => player.address.toLowerCase())
    .filter((address) => address !== normalizedTarget)
}

function activateHide(address: string): void {
  const normalized = address.toLowerCase()
  const entry = getOrCreateHideEntry(normalized)
  if (entry.isActive) return

  const positionFromWorld = getPlayerPositionByAddress(normalized)
  if (positionFromWorld) {
    entry.lastKnownPosition = positionFromWorld
  } else if (normalized === getLocalAddress() && Transform.has(engine.PlayerEntity)) {
    entry.lastKnownPosition = Vector3.clone(Transform.get(engine.PlayerEntity).position)
  }

  const mutableArea = AvatarModifierArea.getMutable(entry.areaEntity)
  mutableArea.excludeIds = getExcludeIdsForTarget(normalized)
  Transform.getMutable(entry.areaEntity).position = Vector3.create(
    entry.lastKnownPosition.x,
    entry.lastKnownPosition.y + HIDE_AREA_CENTER_Y_OFFSET,
    entry.lastKnownPosition.z
  )
  entry.isActive = true
}

function deactivateHide(address: string): void {
  const entry = hideEntriesByAddress.get(address.toLowerCase())
  if (!entry || !entry.isActive) return
  Transform.getMutable(entry.areaEntity).position = FAR_AWAY
  entry.isActive = false
}

function deathAnimationSystem(): void {
  const lobby = getLobbyState()
  if (!lobby?.arenaPlayers.length) {
    for (const address of hideEntriesByAddress.keys()) deactivateHide(address)
    return
  }

  const currentAddresses = new Set(lobby.arenaPlayers.map((player) => player.address.toLowerCase()))

  for (const address of currentAddresses) {
    const combat = getPlayerCombatSnapshot(address)
    if (combat?.isDead) activateHide(address)
    else deactivateHide(address)
  }

  for (const address of hideEntriesByAddress.keys()) {
    if (!currentAddresses.has(address)) deactivateHide(address)
  }
}

export function initDeathAnimationSystem(): void {
  if (initialized) return
  initialized = true
  engine.addSystem(deathAnimationSystem, undefined, 'death-animation-system')
}
