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
const HIDE_AREA_SIZE = Vector3.create(3, 4, 3)
const HIDE_AREA_CENTER_Y_OFFSET = 1.5

type ModifierState = 'inactive' | 'alive' | 'dead'

type HideEntry = {
  areaEntity: Entity
  state: ModifierState
  lastKnownPosition: Vector3
}

const hideEntriesByAddress = new Map<string, HideEntry>()
let initialized = false

function createHideEntry(): HideEntry {
  const areaEntity = createHideAreaEntity(
    FAR_AWAY,
    [AvatarModifierType.AMT_DISABLE_PASSPORTS],
    []
  )
  return {
    areaEntity,
    state: 'inactive',
    lastKnownPosition: Vector3.create(0, 0, 0)
  }
}

function createHideAreaEntity(position: Vector3, modifiers: AvatarModifierType[], excludeIds: string[]): Entity {
  const areaEntity = engine.addEntity()
  Transform.create(areaEntity, {
    position,
    rotation: Quaternion.Identity(),
    scale: Vector3.One()
  })
  AvatarModifierArea.create(areaEntity, {
    area: HIDE_AREA_SIZE,
    modifiers,
    excludeIds
  })
  return areaEntity
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

function getModifiersForState(state: ModifierState): AvatarModifierType[] {
  return state === 'dead'
    ? [AvatarModifierType.AMT_DISABLE_PASSPORTS, AvatarModifierType.AMT_HIDE_AVATARS]
    : [AvatarModifierType.AMT_DISABLE_PASSPORTS]
}

function replaceEntryArea(entry: HideEntry, state: ModifierState, position: Vector3, excludeIds: string[]): void {
  engine.removeEntity(entry.areaEntity)
  entry.areaEntity = createHideAreaEntity(position, getModifiersForState(state), excludeIds)
  entry.state = state
}

function updateAvatarModifiers(address: string, isDead: boolean): void {
  const normalized = address.toLowerCase()
  const entry = getOrCreateHideEntry(normalized)

  const positionFromWorld = getPlayerPositionByAddress(normalized)
  if (positionFromWorld) {
    entry.lastKnownPosition = positionFromWorld
  } else if (normalized === getLocalAddress() && Transform.has(engine.PlayerEntity)) {
    entry.lastKnownPosition = Vector3.clone(Transform.get(engine.PlayerEntity).position)
  }

  const desiredState: ModifierState = isDead ? 'dead' : 'alive'
  const desiredPosition = Vector3.create(
    entry.lastKnownPosition.x,
    entry.lastKnownPosition.y + HIDE_AREA_CENTER_Y_OFFSET,
    entry.lastKnownPosition.z
  )
  const desiredExcludeIds = getExcludeIdsForTarget(normalized)

  if (entry.state !== desiredState) {
    replaceEntryArea(entry, desiredState, desiredPosition, desiredExcludeIds)
    return
  }

  const mutableArea = AvatarModifierArea.getMutable(entry.areaEntity)
  mutableArea.excludeIds = desiredExcludeIds
  Transform.getMutable(entry.areaEntity).position = desiredPosition
}

function deactivateAvatarModifiers(address: string): void {
  const entry = hideEntriesByAddress.get(address.toLowerCase())
  if (!entry || entry.state === 'inactive') return
  replaceEntryArea(entry, 'inactive', FAR_AWAY, [])
}

function deathAnimationSystem(): void {
  const lobby = getLobbyState()
  if (!lobby?.arenaPlayers.length) {
    for (const address of hideEntriesByAddress.keys()) deactivateAvatarModifiers(address)
    return
  }

  const currentAddresses = new Set(lobby.arenaPlayers.map((player) => player.address.toLowerCase()))

  for (const address of currentAddresses) {
    const combat = getPlayerCombatSnapshot(address)
    updateAvatarModifiers(address, !!combat?.isDead)
  }

  for (const address of hideEntriesByAddress.keys()) {
    if (!currentAddresses.has(address)) deactivateAvatarModifiers(address)
  }
}

export function initDeathAnimationSystem(): void {
  if (initialized) return
  initialized = true
  engine.addSystem(deathAnimationSystem, undefined, 'death-animation-system')
}
