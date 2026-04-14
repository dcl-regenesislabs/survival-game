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

export type RoomId = 'room_1' | 'room_2'

export const ROOM_IDS: RoomId[] = ['room_1', 'room_2']
export const DEFAULT_ROOM_ID: RoomId = 'room_1'

const ROOM_2_WORLD_OFFSET_X = 103.5
const ROOM_WORLD_OFFSET_BY_ID: Record<RoomId, { x: number; z: number }> = {
  room_1: { x: 0, z: 0 },
  room_2: { x: ROOM_2_WORLD_OFFSET_X, z: 0 }
}

const ROOM_TRIGGER_ENTITY_BY_ID: Record<RoomId, EntityNames> = {
  room_1: EntityNames.trigger_room_1,
  room_2: EntityNames.trigger_room_2
}

const ROOM_JOIN_AREA_ENTITY_BY_ID: Record<RoomId, EntityNames> = {
  room_1: EntityNames.JoinArea01_glb,
  room_2: EntityNames.JoinArea01_glb_2
}

const ROOM_ARENA_ROOT_ENTITY_BY_ID: Record<RoomId, EntityNames> = {
  room_1: EntityNames.arena_1,
  room_2: EntityNames.arena_2
}

const ROOM_NEW_GAME_TEXT_ENTITY_BY_ID: Record<RoomId, EntityNames> = {
  room_1: EntityNames.NewGameText_glb,
  room_2: EntityNames.NewGameText_glb_2
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

function createArenaRoomConfig(roomId: RoomId): ArenaRoomConfig {
  const offset = ROOM_WORLD_OFFSET_BY_ID[roomId]
  const centerX = ARENA_CENTER_X + offset.x
  const centerZ = ARENA_CENTER_Z + offset.z

  return {
    roomId,
    triggerEntityName: ROOM_TRIGGER_ENTITY_BY_ID[roomId],
    joinAreaEntityName: ROOM_JOIN_AREA_ENTITY_BY_ID[roomId],
    arenaRootEntityName: ROOM_ARENA_ROOT_ENTITY_BY_ID[roomId],
    newGameTextEntityName: ROOM_NEW_GAME_TEXT_ENTITY_BY_ID[roomId],
    arenaCenter: Vector3.create(centerX, 0, centerZ),
    arenaTeleportPosition: { x: centerX, y: 0, z: centerZ },
    arenaTeleportLookAt: { x: centerX, y: 1, z: centerZ + 1 },
    respawnPosition: { x: centerX, y: 0, z: centerZ },
    respawnLookAt: { x: centerX, y: 1, z: centerZ + 1 },
    spawnMinX: ARENA_SPAWN_MIN_X + offset.x,
    spawnMaxX: ARENA_SPAWN_MAX_X + offset.x,
    spawnMinZ: ARENA_SPAWN_MIN_Z + offset.z,
    spawnMaxZ: ARENA_SPAWN_MAX_Z + offset.z,
    brickMinX: ARENA_BRICK_MIN_X + offset.x,
    brickMaxX: ARENA_BRICK_MAX_X + offset.x,
    brickMinZ: ARENA_BRICK_MIN_Z + offset.z,
    brickMaxZ: ARENA_BRICK_MAX_Z + offset.z,
    floorMinX: ARENA_FLOOR_POSITION_X + offset.x,
    floorMinZ: ARENA_FLOOR_POSITION_Z + offset.z,
    floorSizeX: ARENA_FLOOR_WORLD_SIZE_X,
    floorSizeZ: ARENA_FLOOR_WORLD_SIZE_Z
  }
}

const ROOM_CONFIG_BY_ID: Record<RoomId, ArenaRoomConfig> = {
  room_1: createArenaRoomConfig('room_1'),
  room_2: createArenaRoomConfig('room_2')
}

export function isRoomId(value: string): value is RoomId {
  return value === 'room_1' || value === 'room_2'
}

export function getArenaRoomConfig(roomId: RoomId): ArenaRoomConfig {
  return ROOM_CONFIG_BY_ID[roomId]
}

export const LOBBY_RETURN_POSITION = { x: 90, y: 3, z: 32 }
export const LOBBY_RETURN_LOOK_AT = { x: 106.75, y: 1, z: 32 }
