import { engine, PlayerIdentityData, RealmInfo } from '@dcl/sdk/ecs'
import { room } from '../shared/messages'
import { LobbyStateComponent, LobbyStateSnapshot } from '../shared/lobbySchemas'
import { MatchRuntimeSnapshot, MatchRuntimeStateComponent } from '../shared/matchRuntimeSchemas'
import { movePlayerTo } from '~system/RestrictedActions'

let latestLobbyEvent = ''
let hasProfileLoadSent = false
let localReadyForMatch = false
const READY_POSITION = { x: 32, y: 0, z: 32 }

export function setupLobbyClient(): void {
  room.onMessage('lobbyEvent', (data) => {
    latestLobbyEvent = data.message
    console.log(`[Lobby] ${data.type}: ${data.message}`)
  })

  engine.addSystem(autoJoinLobbySystem, undefined, 'auto-join-lobby-client-system')
}

export function sendLoadProfile(): void {
  void room.send('playerLoadProfile', {})
}

export function sendJoinLobby(): void {
  void room.send('playerJoinLobby', {})
}

export function sendLeaveLobby(): void {
  void room.send('playerLeaveLobby', {})
}

export function sendCreateMatch(): void {
  void room.send('createMatch', {})
}

export function sendCreateMatchAndJoin(): void {
  void room.send('createMatchAndJoin', {})
}

export function sendReturnToLobby(): void {
  void room.send('returnToLobby', {})
}

export function sendStartZombieWaves(): void {
  void room.send('startZombieWaves', {})
}

export function getLocalAddress(): string {
  const identity = PlayerIdentityData.getOrNull(engine.PlayerEntity)
  return identity?.address?.toLowerCase() || ''
}

function autoJoinLobbySystem(): void {
  if (hasProfileLoadSent) return
  const localAddress = getLocalAddress()
  if (!localAddress) return

  const realmInfo = RealmInfo.getOrNull(engine.RootEntity)
  if (!realmInfo?.isConnectedSceneRoom) return

  hasProfileLoadSent = true
  sendLoadProfile()
}

export function getLobbyState(): LobbyStateSnapshot | null {
  for (const [entity] of engine.getEntitiesWith(LobbyStateComponent)) {
    const state = LobbyStateComponent.get(entity)
    const localAddress = getLocalAddress()
    const isInLobby = !!localAddress && state.players.some((p) => p.address === localAddress)
    if (state.phase !== 'match_created' || !isInLobby) {
      localReadyForMatch = false
    }
    return {
      phase: state.phase,
      matchId: state.matchId,
      hostAddress: state.hostAddress,
      players: [...state.players]
    }
  }
  return null
}

export function getMatchRuntimeState(): MatchRuntimeSnapshot | null {
  for (const [entity] of engine.getEntitiesWith(MatchRuntimeStateComponent)) {
    const state = MatchRuntimeStateComponent.get(entity)
    return {
      isRunning: state.isRunning,
      waveNumber: state.waveNumber,
      cyclePhase: state.cyclePhase,
      serverNowMs: state.serverNowMs,
      phaseEndTimeMs: state.phaseEndTimeMs,
      activeDurationSeconds: state.activeDurationSeconds,
      restDurationSeconds: state.restDurationSeconds,
      startedByAddress: state.startedByAddress,
      zombiesAlive: state.zombiesAlive,
      zombiesPlanned: state.zombiesPlanned
    }
  }
  return null
}

export function getLatestLobbyEvent(): string {
  return latestLobbyEvent
}

export function markLocalReadyForMatch(): void {
  localReadyForMatch = true
  movePlayerTo({
    newRelativePosition: READY_POSITION,
    cameraTarget: { x: READY_POSITION.x, y: 1, z: READY_POSITION.z + 1 }
  })
}

export function isLocalReadyForMatch(): boolean {
  return localReadyForMatch
}
