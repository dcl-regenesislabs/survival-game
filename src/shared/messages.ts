import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

const LobbyMessages = {
  playerLoadProfile: Schemas.Map({}),
  playerJoinLobby: Schemas.Map({}),
  playerLeaveLobby: Schemas.Map({}),
  buyLoadoutWeapon: Schemas.Map({
    weaponId: Schemas.String
  }),
  equipLoadoutWeapon: Schemas.Map({
    weaponId: Schemas.String
  }),
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
  playerDamageRequest: Schemas.Map({
    amount: Schemas.Number
  }),
  playerHealthState: Schemas.Map({
    address: Schemas.String,
    hp: Schemas.Number,
    isDead: Schemas.Boolean,
    respawnAtMs: Schemas.Int64
  }),
  matchAutoTeleport: Schemas.Map({
    addresses: Schemas.Array(Schemas.String),
    positionX: Schemas.Number,
    positionY: Schemas.Number,
    positionZ: Schemas.Number,
    lookAtX: Schemas.Number,
    lookAtY: Schemas.Number,
    lookAtZ: Schemas.Number
  }),
  playerLoadoutState: Schemas.Map({
    address: Schemas.String,
    gold: Schemas.Number,
    ownedWeaponIds: Schemas.Array(Schemas.String),
    equippedWeaponIds: Schemas.Array(Schemas.String)
  }),
  lobbyEvent: Schemas.Map({
    type: Schemas.String,
    message: Schemas.String
  })
}

export const room = registerMessages(LobbyMessages)
