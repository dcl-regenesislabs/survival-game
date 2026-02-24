import { engine, PlayerIdentityData } from '@dcl/sdk/ecs'
import { room } from '../shared/messages'
import { LobbyStateComponent, LobbyStateSnapshot } from '../shared/lobbySchemas'
import { MatchRuntimeSnapshot, MatchRuntimeStateComponent } from '../shared/matchRuntimeSchemas'

let latestLobbyEvent = ''

export function setupLobbyClient(): void {
  room.onMessage('lobbyEvent', (data) => {
    latestLobbyEvent = data.message
    console.log(`[Lobby] ${data.type}: ${data.message}`)
  })
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

export function getLobbyState(): LobbyStateSnapshot | null {
  for (const [entity] of engine.getEntitiesWith(LobbyStateComponent)) {
    const state = LobbyStateComponent.get(entity)
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
