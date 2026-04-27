import { engine, Name, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { EntityNames } from '../../assets/scene/entity-names'
import {
  ARENA_BRICK_MAX_X,
  ARENA_BRICK_MAX_Z,
  ARENA_BRICK_MIN_X,
  ARENA_BRICK_MIN_Z,
  ARENA_CENTER_X,
  ARENA_CENTER_Z,
  ARENA_FLOOR_POSITION_X,
  ARENA_FLOOR_POSITION_Z,
  ARENA_FLOOR_WORLD_SIZE_X,
  ARENA_FLOOR_WORLD_SIZE_Z,
  ARENA_SPAWN_MAX_X,
  ARENA_SPAWN_MAX_Z,
  ARENA_SPAWN_MIN_X,
  ARENA_SPAWN_MIN_Z
} from './arenaConfig'

export type RoomId = 'room_1' | 'room_2' | 'room_3' | 'room_4'

export const ROOM_IDS: RoomId[] = ['room_1', 'room_2', 'room_3', 'room_4']
export const DEFAULT_ROOM_ID: RoomId = 'room_1'
type Entity = ReturnType<typeof engine.addEntity>
type SceneArenaLayout = {
  floorCenterX: number
  floorCenterY: number
  floorCenterZ: number
  floorSizeX: number
  floorSizeZ: number
  lookAtX: number
  lookAtY: number
  lookAtZ: number
}

const ROOM_2_WORLD_OFFSET_X = 103.5
const ROOM_3_WORLD_OFFSET_Z = 53.5
const ROOM_WORLD_OFFSET_BY_ID: Record<RoomId, { x: number; z: number }> = {
  room_1: { x: 0, z: 0 },
  room_2: { x: ROOM_2_WORLD_OFFSET_X, z: 0 },
  room_3: { x: 0, z: ROOM_3_WORLD_OFFSET_Z },
  room_4: { x: ROOM_2_WORLD_OFFSET_X, z: ROOM_3_WORLD_OFFSET_Z }
}

const ROOM_TRIGGER_ENTITY_BY_ID: Record<RoomId, EntityNames> = {
  room_1: EntityNames.trigger_room_1,
  room_2: EntityNames.trigger_room_2,
  room_3: EntityNames.trigger_room_3,
  room_4: EntityNames.trigger_room_4
}

const ROOM_JOIN_AREA_ENTITY_BY_ID: Record<RoomId, EntityNames> = {
  room_1: EntityNames.JoinArea01_glb,
  room_2: EntityNames.JoinArea01_glb_2,
  room_3: EntityNames.JoinArea01_glb_3,
  room_4: EntityNames.JoinArea01_glb_4
}

const ROOM_ARENA_ROOT_ENTITY_BY_ID: Record<RoomId, EntityNames> = {
  room_1: EntityNames.arena_1,
  room_2: EntityNames.arena_2,
  room_3: EntityNames.arena_3,
  room_4: EntityNames.arena_4
}
const ARENA_FLOOR_NAME_PREFIX = 'Plane'

const ROOM_NEW_GAME_TEXT_ENTITY_BY_ID: Record<RoomId, EntityNames> = {
  room_1: EntityNames.NewGameText_glb,
  room_2: EntityNames.NewGameText_glb_2,
  room_3: EntityNames.NewGameText_glb_3,
  room_4: EntityNames.NewGameText_glb_4
}

export type ArenaRoomConfig = {
  roomId: RoomId
  triggerEntityName: EntityNames
  joinAreaEntityName: EntityNames
  arenaRootEntityName: EntityNames
  newGameTextEntityName: EntityNames
  arenaCenter: Vector3
  arenaTeleportPosition: { x: number; y: number; z: number }
  arenaTeleportLookAt: { x: number; y: number; z: number }
  respawnPosition: { x: number; y: number; z: number }
  respawnLookAt: { x: number; y: number; z: number }
  spawnMinX: number
  spawnMaxX: number
  spawnMinZ: number
  spawnMaxZ: number
  brickMinX: number
  brickMaxX: number
  brickMinZ: number
  brickMaxZ: number
  floorMinX: number
  floorMinZ: number
  floorSizeX: number
  floorSizeZ: number
}

function createArenaRoomConfig(roomId: RoomId, sceneLayout?: SceneArenaLayout): ArenaRoomConfig {
  const offset = ROOM_WORLD_OFFSET_BY_ID[roomId]
  const fallbackCenterX = ARENA_CENTER_X + offset.x
  const fallbackCenterZ = ARENA_CENTER_Z + offset.z
  const fallbackFloorMinX = ARENA_FLOOR_POSITION_X + offset.x
  const fallbackFloorMinZ = ARENA_FLOOR_POSITION_Z + offset.z
  const centerX = sceneLayout?.floorCenterX ?? fallbackCenterX
  const centerY = sceneLayout?.floorCenterY ?? 0
  const centerZ = sceneLayout?.floorCenterZ ?? fallbackCenterZ
  const floorSizeX = sceneLayout?.floorSizeX ?? ARENA_FLOOR_WORLD_SIZE_X
  const floorSizeZ = sceneLayout?.floorSizeZ ?? ARENA_FLOOR_WORLD_SIZE_Z
  const floorMinX = sceneLayout ? centerX - floorSizeX * 0.5 : fallbackFloorMinX
  const floorMinZ = sceneLayout ? centerZ - floorSizeZ * 0.5 : fallbackFloorMinZ
  const lookAtX = sceneLayout?.lookAtX ?? centerX
  const lookAtY = sceneLayout?.lookAtY ?? centerY + 1
  const lookAtZ = sceneLayout?.lookAtZ ?? centerZ + 1
  const spawnMinX = sceneLayout ? centerX + (ARENA_SPAWN_MIN_X - ARENA_CENTER_X) : ARENA_SPAWN_MIN_X + offset.x
  const spawnMaxX = sceneLayout ? centerX + (ARENA_SPAWN_MAX_X - ARENA_CENTER_X) : ARENA_SPAWN_MAX_X + offset.x
  const spawnMinZ = sceneLayout ? centerZ + (ARENA_SPAWN_MIN_Z - ARENA_CENTER_Z) : ARENA_SPAWN_MIN_Z + offset.z
  const spawnMaxZ = sceneLayout ? centerZ + (ARENA_SPAWN_MAX_Z - ARENA_CENTER_Z) : ARENA_SPAWN_MAX_Z + offset.z
  const brickMinX = sceneLayout ? centerX + (ARENA_BRICK_MIN_X - ARENA_CENTER_X) : ARENA_BRICK_MIN_X + offset.x
  const brickMaxX = sceneLayout ? centerX + (ARENA_BRICK_MAX_X - ARENA_CENTER_X) : ARENA_BRICK_MAX_X + offset.x
  const brickMinZ = sceneLayout ? centerZ + (ARENA_BRICK_MIN_Z - ARENA_CENTER_Z) : ARENA_BRICK_MIN_Z + offset.z
  const brickMaxZ = sceneLayout ? centerZ + (ARENA_BRICK_MAX_Z - ARENA_CENTER_Z) : ARENA_BRICK_MAX_Z + offset.z

  return {
    roomId,
    triggerEntityName: ROOM_TRIGGER_ENTITY_BY_ID[roomId],
    joinAreaEntityName: ROOM_JOIN_AREA_ENTITY_BY_ID[roomId],
    arenaRootEntityName: ROOM_ARENA_ROOT_ENTITY_BY_ID[roomId],
    newGameTextEntityName: ROOM_NEW_GAME_TEXT_ENTITY_BY_ID[roomId],
    arenaCenter: Vector3.create(centerX, centerY, centerZ),
    arenaTeleportPosition: { x: centerX, y: centerY, z: centerZ },
    arenaTeleportLookAt: { x: lookAtX, y: lookAtY, z: lookAtZ },
    respawnPosition: { x: centerX, y: centerY, z: centerZ },
    respawnLookAt: { x: lookAtX, y: lookAtY, z: lookAtZ },
    spawnMinX,
    spawnMaxX,
    spawnMinZ,
    spawnMaxZ,
    brickMinX,
    brickMaxX,
    brickMinZ,
    brickMaxZ,
    floorMinX,
    floorMinZ,
    floorSizeX,
    floorSizeZ
  }
}

const DEFAULT_ROOM_CONFIG_BY_ID: Record<RoomId, ArenaRoomConfig> = {
  room_1: createArenaRoomConfig('room_1'),
  room_2: createArenaRoomConfig('room_2'),
  room_3: createArenaRoomConfig('room_3'),
  room_4: createArenaRoomConfig('room_4')
}
const sceneRoomConfigById: Partial<Record<RoomId, ArenaRoomConfig>> = {}

function findSceneEntity(entityName: EntityNames): Entity | null {
  for (const [entity, name] of engine.getEntitiesWith(Name)) {
    if (name.value === entityName) return entity
  }
  return null
}

function findArenaFloorEntity(arenaRootEntity: Entity): Entity | null {
  for (const [entity, name, transform] of engine.getEntitiesWith(Name, Transform)) {
    if (transform.parent !== arenaRootEntity) continue
    if (!name.value.startsWith(ARENA_FLOOR_NAME_PREFIX)) continue
    return entity
  }
  return null
}

function tryResolveSceneArenaLayout(roomId: RoomId): SceneArenaLayout | null {
  const arenaRootEntity = findSceneEntity(ROOM_ARENA_ROOT_ENTITY_BY_ID[roomId])
  if (!arenaRootEntity) return null

  const floorEntity = findArenaFloorEntity(arenaRootEntity)
  if (!floorEntity) return null

  const rootTransform = Transform.getOrNull(arenaRootEntity)
  const floorTransform = Transform.getOrNull(floorEntity)
  if (!rootTransform || !floorTransform) return null

  const scaledFloorOffset = Vector3.create(
    floorTransform.position.x * rootTransform.scale.x,
    floorTransform.position.y * rootTransform.scale.y,
    floorTransform.position.z * rootTransform.scale.z
  )
  const floorCenter = Vector3.add(rootTransform.position, Vector3.rotate(scaledFloorOffset, rootTransform.rotation))
  const floorSizeX = Math.abs(floorTransform.scale.x * rootTransform.scale.x)
  const floorSizeZ = Math.abs(floorTransform.scale.y * rootTransform.scale.z)
  const lookDirection = Vector3.rotate(Vector3.create(0, 0, 1), rootTransform.rotation)

  return {
    floorCenterX: floorCenter.x,
    floorCenterY: floorCenter.y,
    floorCenterZ: floorCenter.z,
    floorSizeX,
    floorSizeZ,
    lookAtX: floorCenter.x + lookDirection.x,
    lookAtY: floorCenter.y + 1 + lookDirection.y,
    lookAtZ: floorCenter.z + lookDirection.z
  }
}

export function refreshArenaRoomConfigsFromScene(): void {
  for (const roomId of ROOM_IDS) {
    const sceneLayout = tryResolveSceneArenaLayout(roomId)
    if (!sceneLayout) continue
    sceneRoomConfigById[roomId] = createArenaRoomConfig(roomId, sceneLayout)
  }
}

export function isRoomId(value: string): value is RoomId {
  return value === 'room_1' || value === 'room_2' || value === 'room_3' || value === 'room_4'
}

export function getArenaRoomConfig(roomId: RoomId): ArenaRoomConfig {
  const sceneConfig = sceneRoomConfigById[roomId]
  if (sceneConfig) return sceneConfig

  const sceneLayout = tryResolveSceneArenaLayout(roomId)
  if (!sceneLayout) return DEFAULT_ROOM_CONFIG_BY_ID[roomId]

  const resolvedConfig = createArenaRoomConfig(roomId, sceneLayout)
  sceneRoomConfigById[roomId] = resolvedConfig
  return resolvedConfig
}

export const LOBBY_RETURN_POSITION = { x: 84.25, y: 0, z: 19.75 }
export const LOBBY_RETURN_LOOK_AT = { x: 84.25, y: 1, z: 23.25 }
