import { engine, PlayerIdentityData, RealmInfo } from '@dcl/sdk/ecs'
import { room } from '../shared/messages'
import { LobbyStateComponent, LobbyStateSnapshot } from '../shared/lobbySchemas'
import { MatchRuntimeSnapshot, MatchRuntimeStateComponent } from '../shared/matchRuntimeSchemas'
import { movePlayerTo } from '~system/RestrictedActions'
import { applyAuthoritativeHealthState } from '../playerHealth'
import { applyPlayerLoadoutSnapshot } from '../loadoutState'
import { resetArenaWeaponProgress } from '../weaponManager'
import { resetToIdle } from '../waveManager'

let latestLobbyEvent = ''
let latestLobbyEventType = ''
let latestLobbyEventAtMs = 0
let hasProfileLoadSent = false
let localReadyForMatch = false

export function setupLobbyClient(): void {
  room.onMessage('lobbyEvent', (data) => {
    latestLobbyEvent = data.message
    latestLobbyEventType = data.type
    latestLobbyEventAtMs = Date.now()
    if (data.type === 'team_wipe' || data.type === 'lobby') {
      resetToIdle()
      resetArenaWeaponProgress()
    }
    if (data.type === 'waves_started') {
      resetArenaWeaponProgress()
    }
    console.log(`[Lobby] ${data.type}: ${data.message}`)
  })
  room.onMessage('playerHealthState', (data) => {
    const localAddress = getLocalAddress()
    if (!localAddress || data.address !== localAddress) return
    applyAuthoritativeHealthState(data.hp, data.isDead, data.respawnAtMs)
  })
  room.onMessage('playerLoadoutState', (data) => {
    const localAddress = getLocalAddress()
    if (!localAddress || data.address !== localAddress) return
    applyPlayerLoadoutSnapshot(data)
  })
  room.onMessage('matchAutoTeleport', (data) => {
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

export function sendBuyLoadoutWeapon(weaponId: string): void {
  void room.send('buyLoadoutWeapon', { weaponId })
}

export function sendEquipLoadoutWeapon(weaponId: string): void {
  void room.send('equipLoadoutWeapon', { weaponId })
}

export function sendCreateMatch(): void {
  void room.send('createMatch', {})
}

export function sendCreateMatchAndJoin(): void {
  void room.send('createMatchAndJoin', {})
}

export function sendPlayerDamageRequest(amount: number): void {
  void room.send('playerDamageRequest', { amount })
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
      players: [...state.players],
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
  return Date.now() - latestLobbyEventAtMs <= windowMs
}

export function isLocalReadyForMatch(): boolean {
  return localReadyForMatch
}
