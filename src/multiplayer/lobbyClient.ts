import { engine, PlayerIdentityData, RealmInfo } from '@dcl/sdk/ecs'
import { binaryMessageBus } from '@dcl/sdk/network'
import { CommsMessage } from '@dcl/sdk/network/binary-message-bus'
import { room } from '../shared/messages'
import { LobbyStateComponent, LobbyStateSnapshot } from '../shared/lobbySchemas'
import { MatchRuntimeSnapshot, MatchRuntimeStateComponent } from '../shared/matchRuntimeSchemas'
import { movePlayerTo } from '~system/RestrictedActions'
import { Vector3 } from '@dcl/sdk/math'
import { applyAuthoritativeHealthState } from '../playerHealth'
import { applyPlayerLoadoutSnapshot } from '../loadoutState'
import { enableArenaWeapon, resetArenaWeaponProgress } from '../weaponManager'
import { resetToIdle } from '../waveManager'
import { ArenaWeaponType } from '../shared/loadoutCatalog'
import { logNetworkReceive, logNetworkSend, logProfileLoadAttempt, notifyFirstRecv, getProfileLoadDebugState } from '../networkDebug'

let latestLobbyEvent = ''
let latestLobbyEventType = ''
let latestLobbyEventAtMs = 0
let hasProfileLoadSent = false
let profileLoadSentAtMs = 0
const PROFILE_LOAD_RETRY_INTERVAL_MS = 4000
const PROFILE_LOAD_MAX_RETRIES = 6
let crdtStateRequestElapsedMs = 0
const CRDT_STATE_REQUEST_INTERVAL_MS = 3000
const CRDT_STATE_REQUEST_MAX_ATTEMPTS = 10
let crdtStateRequestAttempts = 0
let localReadyForMatch = false
let lastTeamWipeAffectedLocalPlayer = false
const playerCombatStateByAddress = new Map<string, { hp: number; isDead: boolean; respawnAtMs: number; updatedAtMs: number }>()
const playerArenaWeaponByAddress = new Map<string, ArenaWeaponType>()

export function setupLobbyClient(): void {
  room.onMessage('lobbyEvent', (data) => {
    notifyFirstRecv()
    if (data.type === 'player_joined' || data.type === 'player_joined_match') {
      logNetworkReceive('lobbyEvent', data)
    }
    const localAddress = getLocalAddress()
    const lobbyState = getLobbyState()
    const localIsInArena =
      !!localAddress && !!lobbyState?.arenaPlayers.some((player) => player.address === localAddress)

    latestLobbyEvent = data.message
    latestLobbyEventType = data.type
    latestLobbyEventAtMs = Date.now()
    if (data.type === 'team_wipe') {
      lastTeamWipeAffectedLocalPlayer = localReadyForMatch || localIsInArena
    } else {
      lastTeamWipeAffectedLocalPlayer = false
    }
    if (data.type === 'team_wipe' || data.type === 'lobby') {
      playerArenaWeaponByAddress.clear()
      resetToIdle()
      resetArenaWeaponProgress()
    }
    if (data.type === 'waves_started') {
      if (!localIsInArena || !localReadyForMatch) return
      enableArenaWeapon()
    }
    console.log(`[Lobby] ${data.type}: ${data.message}`)
  })
  room.onMessage('playerHealthState', (data) => {
    logNetworkReceive('playerHealthState', data)
    const address = data.address.toLowerCase()
    playerCombatStateByAddress.set(address, {
      hp: data.hp,
      isDead: data.isDead,
      respawnAtMs: data.respawnAtMs,
      updatedAtMs: Date.now()
    })

    const localAddress = getLocalAddress()
    if (!localAddress || address !== localAddress) return
    applyAuthoritativeHealthState(data.hp, data.isDead, data.respawnAtMs)
  })
  room.onMessage('playerLoadoutState', (data) => {
    logNetworkReceive('playerLoadoutState', data)
    const localAddress = getLocalAddress()
    if (!localAddress || data.address !== localAddress) return
    applyPlayerLoadoutSnapshot(data)
  })
  room.onMessage('playerArenaWeaponState', (data) => {
    logNetworkReceive('playerArenaWeaponState', data)
    if (data.weaponType !== 'gun' && data.weaponType !== 'shotgun' && data.weaponType !== 'minigun') return
    playerArenaWeaponByAddress.set(data.address.toLowerCase(), data.weaponType)
  })
  room.onMessage('matchAutoTeleport', (data) => {
    logNetworkReceive('matchAutoTeleport', data)
    const localAddress = getLocalAddress()
    if (!localAddress || !data.addresses.includes(localAddress)) return
    localReadyForMatch = true
    movePlayerTo({
      newRelativePosition: {
        x: data.positionX,
        y: data.positionY,
        z: data.positionZ
      },
      cameraTarget: {
        x: data.lookAtX,
        y: data.lookAtY,
        z: data.lookAtZ
      }
    })
  })
  room.onMessage('lobbyReturnTeleport', (data) => {
    logNetworkReceive('lobbyReturnTeleport', data)
    const localAddress = getLocalAddress()
    if (!localAddress || !data.addresses.includes(localAddress)) return
    localReadyForMatch = false
    movePlayerTo({
      newRelativePosition: {
        x: data.positionX,
        y: data.positionY,
        z: data.positionZ
      },
      cameraTarget: {
        x: data.lookAtX,
        y: data.lookAtY,
        z: data.lookAtZ
      }
    })
  })

  engine.addSystem(autoJoinLobbySystem, undefined, 'auto-join-lobby-client-system')
  engine.addSystem(forceCrdtStateRequestSystem, undefined, 'force-crdt-state-request-system')
}

export function sendLoadProfile(isConnectedSceneRoom: boolean): void {
  logProfileLoadAttempt(isConnectedSceneRoom)
  logNetworkSend('playerLoadProfile', {})
  void room.send('playerLoadProfile', {})
}

export function sendJoinLobby(): void {
  logNetworkSend('playerJoinLobby', {})
  void room.send('playerJoinLobby', {})
}

export function sendLeaveLobby(): void {
  logNetworkSend('playerLeaveLobby', {})
  void room.send('playerLeaveLobby', {})
}

export function sendBuyLoadoutWeapon(weaponId: string): void {
  logNetworkSend('buyLoadoutWeapon', { weaponId })
  void room.send('buyLoadoutWeapon', { weaponId })
}

export function sendEquipLoadoutWeapon(weaponId: string): void {
  logNetworkSend('equipLoadoutWeapon', { weaponId })
  void room.send('equipLoadoutWeapon', { weaponId })
}

export function sendCreateMatch(): void {
  logNetworkSend('createMatch', {})
  void room.send('createMatch', {})
}

export function sendCreateMatchAndJoin(): void {
  logNetworkSend('createMatchAndJoin', {})
  void room.send('createMatchAndJoin', {})
}

export function sendPlayerDamageRequest(amount: number): void {
  void room.send('playerDamageRequest', { amount })
}

export function sendPlayerHealRequest(amount: number): void {
  void room.send('playerHealRequest', { amount })
}

export function sendPlayerShotRequest(
  weaponType: 'gun' | 'shotgun' | 'minigun',
  origin: Vector3,
  direction: Vector3,
  seq: number
): void {
  const payload = {
    seq,
    weaponType,
    originX: origin.x,
    originY: origin.y,
    originZ: origin.z,
    directionX: direction.x,
    directionY: direction.y,
    directionZ: direction.z,
    firedAtMs: Date.now()
  }
  void room.send('playerShotRequest', payload)
}

export function sendPlayerArenaWeaponChanged(weaponType: ArenaWeaponType): void {
  void room.send('playerArenaWeaponChanged', { weaponType })
}

export function getLocalAddress(): string {
  const identity = PlayerIdentityData.getOrNull(engine.PlayerEntity)
  return identity?.address?.toLowerCase() || ''
}

export function getRoomReadyDebugState() {
  const realmInfo = RealmInfo.getOrNull(engine.RootEntity)
  return {
    roomIsReady: room.isReady(),
    realmRoom: realmInfo?.room ?? 'null',
    commsAdapter: realmInfo?.commsAdapter ?? 'null',
    isConnectedSceneRoom: realmInfo?.isConnectedSceneRoom ?? false,
    crdtAttempts: crdtStateRequestAttempts
  }
}

function autoJoinLobbySystem(): void {
  const localAddress = getLocalAddress()
  if (!localAddress) return

  const realmInfo = RealmInfo.getOrNull(engine.RootEntity)
  if (!realmInfo?.isConnectedSceneRoom) return

  if (hasProfileLoadSent) {
    const alreadyInLobby = !!getLobbyState()?.players.find((p) => p.address === localAddress)
    if (alreadyInLobby) return

    const { attempts } = getProfileLoadDebugState()
    if (attempts.length >= PROFILE_LOAD_MAX_RETRIES) return

    const elapsed = Date.now() - profileLoadSentAtMs
    if (elapsed < PROFILE_LOAD_RETRY_INTERVAL_MS) return

    hasProfileLoadSent = false
  }

  hasProfileLoadSent = true
  profileLoadSentAtMs = Date.now()
  sendLoadProfile(!!realmInfo.isConnectedSceneRoom)
}

function forceCrdtStateRequestSystem(dt: number): void {
  if (room.isReady()) return
  if (crdtStateRequestAttempts >= CRDT_STATE_REQUEST_MAX_ATTEMPTS) return

  const realmInfo = RealmInfo.getOrNull(engine.RootEntity)
  if (!realmInfo?.isConnectedSceneRoom) return

  crdtStateRequestElapsedMs += dt * 1000
  if (crdtStateRequestElapsedMs < CRDT_STATE_REQUEST_INTERVAL_MS) return

  crdtStateRequestElapsedMs = 0
  crdtStateRequestAttempts++
  console.log(`[RoomReady] Forcing REQ_CRDT_STATE attempt ${crdtStateRequestAttempts}`)
  binaryMessageBus.emit(CommsMessage.REQ_CRDT_STATE, new Uint8Array())
}

export function getLobbyState(): LobbyStateSnapshot | null {
  for (const [entity] of engine.getEntitiesWith(LobbyStateComponent)) {
    const state = LobbyStateComponent.get(entity)
    const localAddress = getLocalAddress()
    const isInArenaRoster = !!localAddress && state.arenaPlayers.some((p) => p.address === localAddress)
    if (state.phase !== 'match_created' || !isInArenaRoster) {
      localReadyForMatch = false
    }
    return {
      phase: state.phase,
      matchId: state.matchId,
      hostAddress: state.hostAddress,
      players: [...state.players],
      arenaPlayers: [...state.arenaPlayers],
      countdownEndTimeMs: state.countdownEndTimeMs,
      arenaIntroEndTimeMs: state.arenaIntroEndTimeMs
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

export function shouldShowGameOverOverlay(windowMs: number = 3000): boolean {
  if (latestLobbyEventType !== 'team_wipe') return false
  if (!lastTeamWipeAffectedLocalPlayer) return false
  return Date.now() - latestLobbyEventAtMs <= windowMs
}

export function isLocalReadyForMatch(): boolean {
  return localReadyForMatch
}

export function getPlayerCombatSnapshot(address: string): { hp: number; isDead: boolean; respawnAtMs: number } | null {
  const state = playerCombatStateByAddress.get(address.toLowerCase())
  if (!state) return null
  return {
    hp: state.hp,
    isDead: state.isDead,
    respawnAtMs: state.respawnAtMs
  }
}

export function getPlayerArenaWeapon(address: string): ArenaWeaponType {
  return playerArenaWeaponByAddress.get(address.toLowerCase()) ?? 'gun'
}
