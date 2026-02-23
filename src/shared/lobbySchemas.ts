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
  players: Schemas.Array(LobbyPlayerSchema)
}

export const LobbyStateComponent = engine.defineComponent('LobbyStateComponent', LobbyStateSchema, {
  phase: LobbyPhase.LOBBY,
  matchId: '',
  hostAddress: '',
  players: []
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
}
