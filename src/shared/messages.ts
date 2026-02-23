import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

const LobbyMessages = {
  playerJoinLobby: Schemas.Map({}),
  playerLeaveLobby: Schemas.Map({}),
  createMatch: Schemas.Map({}),
  returnToLobby: Schemas.Map({}),
  startZombieWaves: Schemas.Map({}),
  lobbyEvent: Schemas.Map({
    type: Schemas.String,
    message: Schemas.String
  })
}

export const room = registerMessages(LobbyMessages)
