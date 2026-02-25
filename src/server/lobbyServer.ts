import { engine, AvatarBase, PlayerIdentityData } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { LobbyPhase, LobbyStateComponent, LobbyPlayer } from '../shared/lobbySchemas'
import { MatchRuntimeStateComponent, WaveCyclePhase } from '../shared/matchRuntimeSchemas'
import { room } from '../shared/messages'
import {
  CLIENT_BASE_GROUP_SIZE,
  CLIENT_GROUP_GROWTH_EVERY_WAVES,
  CLIENT_MAX_GROUP_SIZE,
  CLIENT_SPAWN_INTERVAL_SECONDS,
  MATCH_MAX_PLAYERS,
  QUICK_ZOMBIE_CHANCE,
  QUICK_ZOMBIE_UNLOCK_WAVE,
  TANK_ZOMBIE_CHANCE,
  TANK_ZOMBIE_UNLOCK_WAVE,
  WAVE_ACTIVE_SECONDS,
  WAVE_REST_SECONDS
} from '../shared/matchConfig'
import { createPlayerProgressStore } from './storage/playerProgress'
import { getServerTime } from '../shared/timeSync'

let lobbyEntity: ReturnType<typeof engine.addEntity> | null = null
let matchRuntimeEntity: ReturnType<typeof engine.addEntity> | null = null
const playerProgressStore = createPlayerProgressStore()
const PLAYER_PROGRESS_AUTOSAVE_SECONDS = 20
const SPAWN_MIN_X = 10
const SPAWN_MAX_X = 54
const SPAWN_MIN_Z = 10
const SPAWN_MAX_Z = 54

type ZombieType = 'basic' | 'quick' | 'tank'
type WavePlanSpawn = {
  zombieId: string
  zombieType: ZombieType
  spawnX: number
  spawnY: number
  spawnZ: number
  spawnAtMs: number
}

let nextZombieSequence = 0
const zombieSpawnAtById = new Map<string, number>()
const deadZombieIds = new Set<string>()
const loadedProfileAddresses = new Set<string>()

function getPlayerDisplayName(address: string): string {
  const normalizedAddress = address.toLowerCase()
  for (const [_entity, identity, avatarBase] of engine.getEntitiesWith(PlayerIdentityData, AvatarBase)) {
    if (identity.address.toLowerCase() === normalizedAddress) {
      return avatarBase.name || normalizedAddress.slice(0, 8)
    }
  }
  return normalizedAddress.slice(0, 8)
}

function getLobbyStateMutable() {
  if (lobbyEntity === null) {
    lobbyEntity = engine.addEntity()
    LobbyStateComponent.create(lobbyEntity, {
      phase: LobbyPhase.LOBBY,
      matchId: '',
      hostAddress: '',
      players: []
    })
    syncEntity(lobbyEntity, [LobbyStateComponent.componentId])
  }
  return LobbyStateComponent.getMutable(lobbyEntity)
}

function getMatchRuntimeMutable() {
  if (matchRuntimeEntity === null) {
    matchRuntimeEntity = engine.addEntity()
    MatchRuntimeStateComponent.create(matchRuntimeEntity, {
      isRunning: false,
      waveNumber: 0,
      cyclePhase: WaveCyclePhase.ACTIVE,
      serverNowMs: getServerTime(),
      phaseEndTimeMs: 0,
      activeDurationSeconds: WAVE_ACTIVE_SECONDS,
      restDurationSeconds: WAVE_REST_SECONDS,
      startedByAddress: '',
      zombiesAlive: 0,
      zombiesPlanned: 0
    })
    syncEntity(matchRuntimeEntity, [MatchRuntimeStateComponent.componentId])
  }
  return MatchRuntimeStateComponent.getMutable(matchRuntimeEntity)
}

function clearZombieTracking(runtime: ReturnType<typeof getMatchRuntimeMutable>): void {
  zombieSpawnAtById.clear()
  deadZombieIds.clear()
  runtime.zombiesAlive = 0
  runtime.zombiesPlanned = 0
}

function recomputeZombiesAlive(runtime: ReturnType<typeof getMatchRuntimeMutable>, nowMs: number): void {
  let alive = 0
  for (const [zombieId, spawnAtMs] of zombieSpawnAtById) {
    if (spawnAtMs > nowMs) continue
    if (deadZombieIds.has(zombieId)) continue
    alive += 1
  }
  runtime.zombiesAlive = alive
}

function resetMatchRuntime() {
  const runtime = getMatchRuntimeMutable()
  runtime.serverNowMs = getServerTime()
  runtime.isRunning = false
  runtime.waveNumber = 0
  runtime.cyclePhase = WaveCyclePhase.ACTIVE
  runtime.phaseEndTimeMs = 0
  runtime.activeDurationSeconds = WAVE_ACTIVE_SECONDS
  runtime.restDurationSeconds = WAVE_REST_SECONDS
  runtime.startedByAddress = ''
  clearZombieTracking(runtime)
}

function getLobbyState() {
  const mutable = getLobbyStateMutable()
  return {
    phase: mutable.phase,
    matchId: mutable.matchId,
    hostAddress: mutable.hostAddress,
    players: [...mutable.players]
  }
}

function setPlayers(players: LobbyPlayer[]) {
  const state = getLobbyStateMutable()
  state.players = players
  if (players.length === 0) {
    state.hostAddress = ''
    state.phase = LobbyPhase.LOBBY
    state.matchId = ''
    resetMatchRuntime()
  } else if (!players.find((p) => p.address === state.hostAddress)) {
    state.hostAddress = players[0].address
  }
}

function isPlayerInLobby(address: string): boolean {
  const state = getLobbyState()
  return state.players.some((p) => p.address === address.toLowerCase())
}

async function ensurePlayerLoadedAndInLobby(address: string): Promise<void> {
  const normalizedAddress = address.toLowerCase()
  await ensurePlayerProfileLoaded(normalizedAddress)
  addPlayerToLobby(normalizedAddress)
}

async function ensurePlayerProfileLoaded(address: string): Promise<void> {
  const normalizedAddress = address.toLowerCase()
  if (loadedProfileAddresses.has(normalizedAddress)) return
  const displayName = getPlayerDisplayName(normalizedAddress)
  const progress = await playerProgressStore.load(normalizedAddress, displayName)
  loadedProfileAddresses.add(normalizedAddress)
  void room.send('lobbyEvent', {
    type: 'profile_loaded',
    message: `${displayName} profile loaded (GOLD ${progress.profile.gold})`
  })
}

function addPlayerToLobby(address: string): void {
  const state = getLobbyState()
  const normalizedAddress = address.toLowerCase()
  if (state.players.some((p) => p.address === normalizedAddress)) return
  if (state.players.length >= MATCH_MAX_PLAYERS) return

  const nextPlayers = [...state.players, { address: normalizedAddress, displayName: getPlayerDisplayName(normalizedAddress) }]
  setPlayers(nextPlayers)

  const mutable = getLobbyStateMutable()
  if (!mutable.hostAddress) {
    mutable.hostAddress = normalizedAddress
  }

  void room.send('lobbyEvent', {
    type: 'join',
    message: `${getPlayerDisplayName(normalizedAddress)} joined lobby`
  })
}

async function removePlayerFromLobby(address: string): Promise<void> {
  const normalizedAddress = address.toLowerCase()
  const state = getLobbyState()
  const nextPlayers = state.players.filter((p) => p.address !== normalizedAddress)
  const leavingPlayer = state.players.find((p) => p.address === normalizedAddress)

  await playerProgressStore.saveAndEvict(normalizedAddress)
  loadedProfileAddresses.delete(normalizedAddress)
  setPlayers(nextPlayers)

  if (leavingPlayer) {
    void room.send('lobbyEvent', {
      type: 'leave',
      message: `${leavingPlayer.displayName} left lobby`
    })
  }
}

function createMatch(address: string): void {
  const normalizedAddress = address.toLowerCase()
  const state = getLobbyState()
  if (state.phase === LobbyPhase.MATCH_CREATED) return
  if (!state.players.length) return
  if (!state.players.some((p) => p.address === normalizedAddress)) return

  const mutable = getLobbyStateMutable()
  mutable.phase = LobbyPhase.MATCH_CREATED
  mutable.hostAddress = state.hostAddress || normalizedAddress
  mutable.matchId = `match_${Date.now()}`
  resetMatchRuntime()

  void room.send('lobbyEvent', {
    type: 'match_created',
    message: `Match created (${mutable.matchId})`
  })
}

function returnLobby(address: string): void {
  const normalizedAddress = address.toLowerCase()
  const mutable = getLobbyStateMutable()
  if (!mutable.hostAddress || mutable.hostAddress !== normalizedAddress) return

  mutable.phase = LobbyPhase.LOBBY
  mutable.matchId = ''
  resetMatchRuntime()

  void room.send('lobbyEvent', {
    type: 'lobby',
    message: 'Returned to lobby'
  })
}

function getSpawnGroupSize(waveNumber: number): number {
  const growth = Math.floor(Math.max(0, waveNumber - 1) / CLIENT_GROUP_GROWTH_EVERY_WAVES)
  return Math.min(CLIENT_MAX_GROUP_SIZE, CLIENT_BASE_GROUP_SIZE + growth)
}

function pickZombieType(waveNumber: number): ZombieType {
  const roll = Math.random()
  if (waveNumber >= TANK_ZOMBIE_UNLOCK_WAVE && roll < TANK_ZOMBIE_CHANCE) return 'tank'
  if (waveNumber >= QUICK_ZOMBIE_UNLOCK_WAVE && roll < QUICK_ZOMBIE_CHANCE) return 'quick'
  return 'basic'
}

function randomSpawnPoint() {
  const spawnX = SPAWN_MIN_X + Math.random() * (SPAWN_MAX_X - SPAWN_MIN_X)
  const spawnZ = SPAWN_MIN_Z + Math.random() * (SPAWN_MAX_Z - SPAWN_MIN_Z)
  return { spawnX, spawnY: 0, spawnZ }
}

function buildWaveSpawnPlan(waveNumber: number, startAtMs: number, activeDurationSeconds: number) {
  const intervalMs = Math.floor(CLIENT_SPAWN_INTERVAL_SECONDS * 1000)
  const activeMs = Math.floor(activeDurationSeconds * 1000)
  const groupSize = getSpawnGroupSize(waveNumber)
  const spawns: WavePlanSpawn[] = []

  for (let offsetMs = 0; offsetMs < activeMs; offsetMs += intervalMs) {
    for (let i = 0; i < groupSize; i++) {
      nextZombieSequence += 1
      const point = randomSpawnPoint()
      const zombieId = `w${waveNumber}_z${nextZombieSequence}`
      spawns.push({
        zombieId,
        zombieType: pickZombieType(waveNumber),
        spawnX: point.spawnX,
        spawnY: point.spawnY,
        spawnZ: point.spawnZ,
        spawnAtMs: startAtMs + offsetMs
      })
    }
  }

  return {
    waveNumber,
    startAtMs,
    intervalMs,
    spawns
  }
}

function sendWaveSpawnPlan(waveNumber: number, startAtMs: number): void {
  const runtime = getMatchRuntimeMutable()
  const plan = buildWaveSpawnPlan(waveNumber, startAtMs, runtime.activeDurationSeconds)

  for (const spawn of plan.spawns) {
    zombieSpawnAtById.set(spawn.zombieId, spawn.spawnAtMs)
    deadZombieIds.delete(spawn.zombieId)
  }

  recomputeZombiesAlive(runtime, runtime.serverNowMs)
  runtime.zombiesPlanned = plan.spawns.length

  void room.send('waveSpawnPlan', plan)
}

function startZombieWaves(address: string): void {
  const normalizedAddress = address.toLowerCase()
  const state = getLobbyState()
  if (state.phase !== LobbyPhase.MATCH_CREATED) return
  if (!state.players.some((p) => p.address === normalizedAddress)) return

  const runtime = getMatchRuntimeMutable()
  if (runtime.isRunning) return

  runtime.isRunning = true
  runtime.waveNumber = 1
  runtime.cyclePhase = WaveCyclePhase.ACTIVE
  runtime.serverNowMs = getServerTime()
  runtime.phaseEndTimeMs = runtime.serverNowMs + runtime.activeDurationSeconds * 1000
  runtime.startedByAddress = normalizedAddress
  clearZombieTracking(runtime)
  sendWaveSpawnPlan(runtime.waveNumber, runtime.serverNowMs)

  for (const player of state.players) {
    playerProgressStore.mutate(player.address, (progress) => {
      progress.profile.lifetimeStats.matchesPlayed += 1
    })
  }

  void room.send('lobbyEvent', {
    type: 'waves_started',
    message: `${getPlayerDisplayName(normalizedAddress)} started zombies`
  })
}

let waveTickAccumulator = 0
function waveRuntimeSystem(dt: number): void {
  waveTickAccumulator += dt
  if (waveTickAccumulator < 0.2) return
  waveTickAccumulator = 0

  const lobbyState = getLobbyState()
  if (lobbyState.phase !== LobbyPhase.MATCH_CREATED) return

  const runtime = getMatchRuntimeMutable()
  const now = getServerTime()
  runtime.serverNowMs = now
  recomputeZombiesAlive(runtime, now)
  if (!runtime.isRunning) return

  if (now < runtime.phaseEndTimeMs) return

  if (runtime.cyclePhase === WaveCyclePhase.ACTIVE) {
    runtime.cyclePhase = WaveCyclePhase.REST
    runtime.phaseEndTimeMs = now + runtime.restDurationSeconds * 1000
    for (const player of lobbyState.players) {
      playerProgressStore.mutate(player.address, (progress) => {
        progress.profile.lifetimeStats.wavesCleared += 1
      })
    }
    void room.send('lobbyEvent', {
      type: 'wave_rest',
      message: `Wave ${runtime.waveNumber} complete. Resting...`
    })
  } else {
    runtime.waveNumber += 1
    runtime.cyclePhase = WaveCyclePhase.ACTIVE
    runtime.phaseEndTimeMs = now + runtime.activeDurationSeconds * 1000
    sendWaveSpawnPlan(runtime.waveNumber, now)
    void room.send('lobbyEvent', {
      type: 'wave_active',
      message: `Wave ${runtime.waveNumber} started`
    })
  }
}

let progressAutosaveAccumulator = 0
function playerProgressAutosaveSystem(dt: number): void {
  progressAutosaveAccumulator += dt
  if (progressAutosaveAccumulator < PLAYER_PROGRESS_AUTOSAVE_SECONDS) return
  progressAutosaveAccumulator = 0
  void playerProgressStore.saveDirty()
}

export function setupLobbyServer(): void {
  getLobbyStateMutable()
  getMatchRuntimeMutable()

  room.onMessage('playerLoadProfile', async (_data, context) => {
    if (!context) return
    await ensurePlayerProfileLoaded(context.from)
  })

  room.onMessage('playerJoinLobby', async (_data, context) => {
    if (!context) return
    await ensurePlayerLoadedAndInLobby(context.from)
  })

  room.onMessage('playerLeaveLobby', async (_data, context) => {
    if (!context) return
    await removePlayerFromLobby(context.from)
  })

  room.onMessage('createMatch', (_data, context) => {
    if (!context) return
    if (!isPlayerInLobby(context.from)) return
    const state = getLobbyState()
    if (state.phase === LobbyPhase.MATCH_CREATED) return
    createMatch(context.from)
  })

  room.onMessage('createMatchAndJoin', async (_data, context) => {
    if (!context) return
    await ensurePlayerLoadedAndInLobby(context.from)
    const state = getLobbyState()
    if (state.phase !== LobbyPhase.MATCH_CREATED) {
      createMatch(context.from)
    }
  })

  room.onMessage('returnToLobby', (_data, context) => {
    if (!context) return
    returnLobby(context.from)
  })

  room.onMessage('startZombieWaves', (_data, context) => {
    if (!context) return
    startZombieWaves(context.from)
  })

  room.onMessage('zombieDieRequest', (data, context) => {
    if (!context) return
    if (!isPlayerInLobby(context.from)) return
    const lobbyState = getLobbyState()
    if (lobbyState.phase !== LobbyPhase.MATCH_CREATED) return
    if (!data.zombieId) return
    const spawnAtMs = zombieSpawnAtById.get(data.zombieId)
    if (spawnAtMs === undefined) return
    if (spawnAtMs > getServerTime()) return
    if (deadZombieIds.has(data.zombieId)) return

    deadZombieIds.add(data.zombieId)
    const runtime = getMatchRuntimeMutable()
    recomputeZombiesAlive(runtime, getServerTime())
    void room.send('zombieDied', { zombieId: data.zombieId })
  })

  engine.addSystem(waveRuntimeSystem, undefined, 'match-wave-runtime-system')
  engine.addSystem(playerProgressAutosaveSystem, undefined, 'player-progress-autosave-system')

  console.log('[Server] Lobby server ready')
}
