import { engine, Schemas } from '@dcl/sdk/ecs'

export enum LobbyPhase {
  LOBBY = 'lobby',
  MATCH_CREATED = 'match_created'
}

const LobbyPlayerSchema = Schemas.Map({
  address: Schemas.String,
  displayName: Schemas.String
})

const LobbyStateSchema = {
  phase: Schemas.EnumString<LobbyPhase>(LobbyPhase, LobbyPhase.LOBBY),
  matchId: Schemas.String,
  hostAddress: Schemas.String,
  players: Schemas.Array(LobbyPlayerSchema),
  arenaPlayers: Schemas.Array(LobbyPlayerSchema),
  countdownEndTimeMs: Schemas.Int64,
  arenaIntroEndTimeMs: Schemas.Int64
}

export const LobbyStateComponent = engine.defineComponent('LobbyStateComponent', LobbyStateSchema, {
  phase: LobbyPhase.LOBBY,
  matchId: '',
  hostAddress: '',
  players: [],
  arenaPlayers: [],
  countdownEndTimeMs: 0,
  arenaIntroEndTimeMs: 0
})

export type LobbyPlayer = {
  address: string
  displayName: string
}

export type LobbyStateSnapshot = {
  phase: LobbyPhase
  matchId: string
  hostAddress: string
  players: LobbyPlayer[]
  arenaPlayers: LobbyPlayer[]
  countdownEndTimeMs: number
  arenaIntroEndTimeMs: number
}
