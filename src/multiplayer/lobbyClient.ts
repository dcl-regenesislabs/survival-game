import { engine, PlayerIdentityData, RealmInfo } from '@dcl/sdk/ecs'
import { room } from '../shared/messages'
import { LobbyStateComponent, LobbyStateSnapshot } from '../shared/lobbySchemas'
import { MatchRuntimeSnapshot, MatchRuntimeStateComponent } from '../shared/matchRuntimeSchemas'
import { movePlayerTo } from '~system/RestrictedActions'
import { Vector3 } from '@dcl/sdk/math'
import { applyAuthoritativeHealthState, resetPlayerHealthState } from '../playerHealth'
import { resetDeathAnimationState, setLocalAvatarHidden } from '../deathAnimation'
import { applyPlayerLoadoutSnapshot } from '../loadoutState'
import { enableArenaWeapon, resetArenaWeaponProgress } from '../weaponManager'
import { resetToIdle } from '../waveManager'
import { ArenaWeaponType } from '../shared/loadoutCatalog'

let latestLobbyEvent = ''
let latestLobbyEventType = ''
let latestLobbyEventAtMs = 0
let hasProfileLoadSent = false
let localReadyForMatch = false
let lastTeamWipeAffectedLocalPlayer = false
const GAME_OVER_OVERLAY_DELAY_MS = 2000
const playerCombatStateByAddress = new Map<string, { hp: number; isDead: boolean; respawnAtMs: number; updatedAtMs: number }>()
const playerArenaWeaponByAddress = new Map<string, { weaponType: ArenaWeaponType; upgradeLevel: number }>()
const playerPowerupStateByAddress = new Map<string, { rageShieldEndAtMs: number; speedEndAtMs: number }>()

function resetLocalMatchUiState(): void {
  localReadyForMatch = false
  lastTeamWipeAffectedLocalPlayer = false
  playerCombatStateByAddress.clear()
  latestLobbyEventType = ''
  setLocalAvatarHidden(false)
  resetToIdle()
  resetArenaWeaponProgress()
  resetPlayerHealthState()
  resetDeathAnimationState()
}

export function setupLobbyClient(): void {
  room.onMessage('lobbyEvent', (data) => {
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
      playerPowerupStateByAddress.clear()
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
    const address = data.address.toLowerCase()
    playerCombatStateByAddress.set(address, {
      hp: data.hp,
      isDead: data.isDead,
      respawnAtMs: data.respawnAtMs,
      updatedAtMs: Date.now()
    })

    const localAddress = getLocalAddress()
    if (!localAddress || address !== localAddress) return
    setLocalAvatarHidden(data.isDead)
    applyAuthoritativeHealthState(data.hp, data.isDead, data.respawnAtMs)
  })
  room.onMessage('playerLoadoutState', (data) => {
    const localAddress = getLocalAddress()
    if (!localAddress || data.address !== localAddress) return
    applyPlayerLoadoutSnapshot(data)
  })
  room.onMessage('playerArenaWeaponState', (data) => {
    if (data.weaponType !== 'gun' && data.weaponType !== 'shotgun' && data.weaponType !== 'minigun') return
    const upgradeLevel = typeof data.upgradeLevel === 'number' && data.upgradeLevel >= 1 ? data.upgradeLevel : 1
    playerArenaWeaponByAddress.set(data.address.toLowerCase(), { weaponType: data.weaponType, upgradeLevel })
  })
  room.onMessage('playerPowerupState', (data) => {
    playerPowerupStateByAddress.set(data.address.toLowerCase(), {
      rageShieldEndAtMs: data.rageShieldEndAtMs,
      speedEndAtMs: data.speedEndAtMs
    })
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
  room.onMessage('lobbyReturnTeleport', (data) => {
    const localAddress = getLocalAddress()
    if (!localAddress || !data.addresses.includes(localAddress)) return
    setLocalAvatarHidden(false)
    resetDeathAnimationState()
    resetLocalMatchUiState()
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
  resetLocalMatchUiState()
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

export function sendStartGameManual(): void {
  void room.send('startGameManual', {})
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
  void room.send('playerShotRequest', {
    seq,
    weaponType,
    originX: origin.x,
    originY: origin.y,
    originZ: origin.z,
    directionX: direction.x,
    directionY: direction.y,
    directionZ: direction.z,
    firedAtMs: Date.now()
  })
}

export function sendRageShieldHitRequest(zombieId: string): void {
  void room.send('rageShieldHitRequest', { zombieId })
}

export function sendZombieExplodeRequest(zombieId: string): void {
  void room.send('zombieExplodeRequest', { zombieId })
}

export function sendPlayerExplosionDamageRequest(zombieId: string, amount: number): void {
  void room.send('playerExplosionDamageRequest', { zombieId, amount })
}

export function sendPlayerArenaWeaponChanged(weaponType: ArenaWeaponType, upgradeLevel: number): void {
  void room.send('playerArenaWeaponChanged', { weaponType, upgradeLevel })
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
  const elapsedMs = Date.now() - latestLobbyEventAtMs
  if (elapsedMs < GAME_OVER_OVERLAY_DELAY_MS) return false
  return elapsedMs <= windowMs + GAME_OVER_OVERLAY_DELAY_MS
}

export function shouldSuppressDeathOverlayForTeamWipe(): boolean {
  return latestLobbyEventType === 'team_wipe' && lastTeamWipeAffectedLocalPlayer
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

export function getPlayerArenaWeapon(address: string): { weaponType: ArenaWeaponType; upgradeLevel: number } {
  return playerArenaWeaponByAddress.get(address.toLowerCase()) ?? { weaponType: 'gun', upgradeLevel: 1 }
}

export function getPlayerPowerupSnapshot(address: string): { rageShieldEndAtMs: number; speedEndAtMs: number } {
  return (
    playerPowerupStateByAddress.get(address.toLowerCase()) ?? {
      rageShieldEndAtMs: 0,
      speedEndAtMs: 0
    }
  )
}
