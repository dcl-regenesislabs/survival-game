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
  startGameManual: Schemas.Map({}),
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
  zombieHitRequest: Schemas.Map({
    zombieId: Schemas.String,
    damage: Schemas.Number,
    weaponType: Schemas.String,
    shotSeq: Schemas.Number
  }),
  rageShieldHitRequest: Schemas.Map({
    zombieId: Schemas.String
  }),
  zombieExplodeRequest: Schemas.Map({
    zombieId: Schemas.String
  }),
  zombieHealthChanged: Schemas.Map({
    zombieId: Schemas.String,
    hp: Schemas.Number
  }),
  zombieDied: Schemas.Map({
    zombieId: Schemas.String,
    killerAddress: Schemas.String
  }),
  zombieExploded: Schemas.Map({
    zombieId: Schemas.String
  }),
  potionSpawned: Schemas.Map({
    potionId: Schemas.String,
    potionType: Schemas.String,
    positionX: Schemas.Number,
    positionY: Schemas.Number,
    positionZ: Schemas.Number,
    expiresAtMs: Schemas.Int64
  }),
  potionClaimRequest: Schemas.Map({
    potionId: Schemas.String
  }),
  potionClaimed: Schemas.Map({
    potionId: Schemas.String,
    claimerAddress: Schemas.String
  }),
  potionExpired: Schemas.Map({
    potionId: Schemas.String
  }),
  potionClaimRejected: Schemas.Map({
    potionId: Schemas.String
  }),
  potionsCleared: Schemas.Map({}),
  playerDamageRequest: Schemas.Map({
    amount: Schemas.Number
  }),
  playerExplosionDamageRequest: Schemas.Map({
    zombieId: Schemas.String,
    amount: Schemas.Number
  }),
  playerHealRequest: Schemas.Map({
    amount: Schemas.Number
  }),
  playerShotRequest: Schemas.Map({
    seq: Schemas.Number,
    weaponType: Schemas.String,
    originX: Schemas.Number,
    originY: Schemas.Number,
    originZ: Schemas.Number,
    directionX: Schemas.Number,
    directionY: Schemas.Number,
    directionZ: Schemas.Number,
    firedAtMs: Schemas.Int64
  }),
  playerArenaWeaponChanged: Schemas.Map({
    weaponType: Schemas.String,
    upgradeLevel: Schemas.Number
  }),
  playerArenaWeaponState: Schemas.Map({
    address: Schemas.String,
    weaponType: Schemas.String,
    upgradeLevel: Schemas.Number
  }),
  playerPowerupState: Schemas.Map({
    address: Schemas.String,
    rageShieldEndAtMs: Schemas.Int64,
    speedEndAtMs: Schemas.Int64
  }),
  playerShotBroadcast: Schemas.Map({
    shooterAddress: Schemas.String,
    seq: Schemas.Number,
    weaponType: Schemas.String,
    originX: Schemas.Number,
    originY: Schemas.Number,
    originZ: Schemas.Number,
    directionX: Schemas.Number,
    directionY: Schemas.Number,
    directionZ: Schemas.Number,
    firedAtMs: Schemas.Int64,
    serverTimeMs: Schemas.Int64
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
  lobbyReturnTeleport: Schemas.Map({
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
  }),
  lavaHazardsSpawned: Schemas.Map({
    hazards: Schemas.Array(
      Schemas.Map({
        lavaId: Schemas.String,
        gridX: Schemas.Number,
        gridZ: Schemas.Number,
        modelVariant: Schemas.Number,
        rotationQuarterTurns: Schemas.Number,
        warningAtMs: Schemas.Int64,
        activeAtMs: Schemas.Int64,
        expiresAtMs: Schemas.Int64
      })
    )
  }),
  lavaHazardsExpired: Schemas.Map({
    lavaIds: Schemas.Array(Schemas.String)
  }),
  lavaHazardsCleared: Schemas.Map({}),
  lavaHazardDamageRequest: Schemas.Map({
    lavaId: Schemas.String
  })
}

export const room = registerMessages(LobbyMessages)
