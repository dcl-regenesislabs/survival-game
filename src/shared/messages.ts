import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

const LobbyMessages = {
  playerJoinLobby: Schemas.Map({}),
  playerLeaveLobby: Schemas.Map({}),
  createMatch: Schemas.Map({}),
  returnToLobby: Schemas.Map({}),
  startZombieWaves: Schemas.Map({}),
  waveSpawnGroup: Schemas.Map({
    waveNumber: Schemas.Number,
    basicCount: Schemas.Number,
    quickCount: Schemas.Number,
    tankCount: Schemas.Number
  }),
  lobbyEvent: Schemas.Map({
    type: Schemas.String,
    message: Schemas.String
  })
}

export const room = registerMessages(LobbyMessages)
