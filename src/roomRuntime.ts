import { DEFAULT_ROOM_ID, RoomId, getArenaRoomConfig } from './shared/roomConfig'

let currentRoomId: RoomId = DEFAULT_ROOM_ID

export function getCurrentRoomId(): RoomId {
  return currentRoomId
}

export function setCurrentRoomId(roomId: RoomId): void {
  currentRoomId = roomId
}

export function getCurrentRoomConfig() {
  return getArenaRoomConfig(currentRoomId)
}
