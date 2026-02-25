import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

const LobbyMessages = {
  playerLoadProfile: Schemas.Map({}),
  playerJoinLobby: Schemas.Map({}),
  playerLeaveLobby: Schemas.Map({}),
  createMatch: Schemas.Map({}),
  createMatchAndJoin: Schemas.Map({}),
  returnToLobby: Schemas.Map({}),
  startZombieWaves: Schemas.Map({}),
  waveSpawnPlan: Schemas.Map({
    waveNumber: Schemas.Number,
    startAtMs: Schemas.Int64,
    intervalMs: Schemas.Int64,
    spawns: Schemas.Array(
      Schemas.Map({
        zombieId: Schemas.String,
        zombieType: Schemas.String,
        spawnX: Schemas.Number,
        spawnY: Schemas.Number,
        spawnZ: Schemas.Number,
        spawnAtMs: Schemas.Int64
      })
    )
  }),
  zombieDieRequest: Schemas.Map({
    zombieId: Schemas.String
  }),
  zombieDied: Schemas.Map({
    zombieId: Schemas.String
  }),
  lobbyEvent: Schemas.Map({
    type: Schemas.String,
    message: Schemas.String
  })
}

export const room = registerMessages(LobbyMessages)
