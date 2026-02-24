import { engine, AvatarBase, PlayerIdentityData } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { LobbyPhase, LobbyStateComponent, LobbyPlayer } from '../shared/lobbySchemas'
import { MatchRuntimeStateComponent, WaveCyclePhase } from '../shared/matchRuntimeSchemas'
import { room } from '../shared/messages'
import { MATCH_MAX_PLAYERS, WAVE_ACTIVE_SECONDS, WAVE_REST_SECONDS } from '../shared/matchConfig'

let lobbyEntity: ReturnType<typeof engine.addEntity> | null = null
let matchRuntimeEntity: ReturnType<typeof engine.addEntity> | null = null

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
      phaseEndTimeMs: 0,
      activeDurationSeconds: WAVE_ACTIVE_SECONDS,
      restDurationSeconds: WAVE_REST_SECONDS,
      startedByAddress: ''
    })
    syncEntity(matchRuntimeEntity, [MatchRuntimeStateComponent.componentId])
  }
  return MatchRuntimeStateComponent.getMutable(matchRuntimeEntity)
}

function resetMatchRuntime() {
  const runtime = getMatchRuntimeMutable()
  runtime.isRunning = false
  runtime.waveNumber = 0
  runtime.cyclePhase = WaveCyclePhase.ACTIVE
  runtime.phaseEndTimeMs = 0
  runtime.activeDurationSeconds = WAVE_ACTIVE_SECONDS
  runtime.restDurationSeconds = WAVE_REST_SECONDS
  runtime.startedByAddress = ''
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

function removePlayerFromLobby(address: string): void {
  const normalizedAddress = address.toLowerCase()
  const state = getLobbyState()
  const nextPlayers = state.players.filter((p) => p.address !== normalizedAddress)
  const leavingPlayer = state.players.find((p) => p.address === normalizedAddress)

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
  runtime.phaseEndTimeMs = Date.now() + runtime.activeDurationSeconds * 1000
  runtime.startedByAddress = normalizedAddress

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
  if (!runtime.isRunning) return

  const now = Date.now()
  if (now < runtime.phaseEndTimeMs) return

  if (runtime.cyclePhase === WaveCyclePhase.ACTIVE) {
    runtime.cyclePhase = WaveCyclePhase.REST
    runtime.phaseEndTimeMs = now + runtime.restDurationSeconds * 1000
    void room.send('lobbyEvent', {
      type: 'wave_rest',
      message: `Wave ${runtime.waveNumber} complete. Resting...`
    })
  } else {
    runtime.waveNumber += 1
    runtime.cyclePhase = WaveCyclePhase.ACTIVE
    runtime.phaseEndTimeMs = now + runtime.activeDurationSeconds * 1000
    void room.send('lobbyEvent', {
      type: 'wave_active',
      message: `Wave ${runtime.waveNumber} started`
    })
  }
}

export function setupLobbyServer(): void {
  getLobbyStateMutable()
  getMatchRuntimeMutable()

  room.onMessage('playerJoinLobby', (_data, context) => {
    if (!context) return
    addPlayerToLobby(context.from)
  })

  room.onMessage('playerLeaveLobby', (_data, context) => {
    if (!context) return
    removePlayerFromLobby(context.from)
  })

  room.onMessage('createMatch', (_data, context) => {
    if (!context) return
    if (!isPlayerInLobby(context.from)) return
    createMatch(context.from)
  })

  room.onMessage('returnToLobby', (_data, context) => {
    if (!context) return
    returnLobby(context.from)
  })

  room.onMessage('startZombieWaves', (_data, context) => {
    if (!context) return
    startZombieWaves(context.from)
  })

  engine.addSystem(waveRuntimeSystem, undefined, 'match-wave-runtime-system')

  console.log('[Server] Lobby server ready')
}
