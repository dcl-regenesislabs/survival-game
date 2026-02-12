import { engine } from '@dcl/sdk/ecs'
import { getGameTime, spawnZombie, despawnAllZombies } from './zombie'
import { ZombieComponent } from './zombie'

const MAX_WAVES = 3
const COUNTDOWN_SECONDS = 3
const SPAWN_BATCH_DELAY_SECONDS = 2

/** Wave spawn config: first batch at 0s, second batch after SPAWN_BATCH_DELAY_SECONDS */
const WAVE_CONFIG: [number, number][] = [
  [5, 5],   // Wave 1: 5 + 5 = 10
  [10, 10], // Wave 2: 10 + 10 = 20
  [15, 15]  // Wave 3: 15 + 15 = 30
]

export type WavePhase = 'idle' | 'countdown' | 'fighting' | 'wave_complete' | 'game_complete'

export interface WaveUiState {
  phase: WavePhase
  currentWave: number
  countdownValue: number
  zombiesRemaining: number
  message: string
}

const WAVE_COMPLETE_DELAY = 2

const state: {
  phase: WavePhase
  currentWave: number
  countdownValue: number
  countdownEndTime: number
  waveCompleteEndTime: number
  waveStartTime: number
  spawnSchedule: { at: number; count: number }[]
  nextSpawnIndex: number
} = {
  phase: 'idle',
  currentWave: 0,
  countdownValue: 0,
  countdownEndTime: 0,
  waveCompleteEndTime: 0,
  waveStartTime: 0,
  spawnSchedule: [],
  nextSpawnIndex: 0
}

export function getWaveUiState(): WaveUiState {
  const zombiesRemaining = countZombiesAlive()
  let message = ''
  switch (state.phase) {
    case 'idle':
      message = 'Press START to begin'
      break
    case 'countdown':
      message = state.countdownValue > 0 ? String(state.countdownValue) : 'GO!'
      break
    case 'fighting':
      message = `Zombies: ${zombiesRemaining}`
      break
    case 'wave_complete':
      message = state.currentWave >= MAX_WAVES ? 'All waves complete!' : 'Wave complete! Next wave starting...'
      break
    case 'game_complete':
      message = 'All waves complete! Press START to play again.'
      break
    default:
      message = ''
  }
  return {
    phase: state.phase,
    currentWave: state.currentWave,
    countdownValue: state.countdownValue,
    zombiesRemaining,
    message
  }
}

export function getWaveCountdownLabel(): string {
  if (state.phase !== 'countdown' || state.currentWave < 1) return ''
  return `WAVE ${state.currentWave} starts in`
}

function countZombiesAlive(): number {
  let count = 0
  for (const [_entity] of engine.getEntitiesWith(ZombieComponent)) {
    count++
  }
  return count
}

function buildSpawnSchedule(wave: number): { at: number; count: number }[] {
  const [first, second] = WAVE_CONFIG[wave - 1]
  return [
    { at: 0, count: first },
    { at: SPAWN_BATCH_DELAY_SECONDS, count: second }
  ]
}

/** Call when the player presses Start (Button3). Starts wave 1 if idle, or next wave if wave_complete; restarts from wave 1 if game_complete. */
export function onStartPressed(): void {
  if (state.phase === 'idle' || state.phase === 'game_complete') {
    state.currentWave = 1
    state.phase = 'countdown'
    state.countdownValue = COUNTDOWN_SECONDS
    state.countdownEndTime = getGameTime() + COUNTDOWN_SECONDS
    state.nextSpawnIndex = 0
    state.spawnSchedule = []
    return
  }
  if (state.phase === 'wave_complete' && state.currentWave < MAX_WAVES) {
    state.currentWave += 1
    state.phase = 'countdown'
    state.countdownValue = COUNTDOWN_SECONDS
    state.countdownEndTime = getGameTime() + COUNTDOWN_SECONDS
    state.nextSpawnIndex = 0
    state.spawnSchedule = buildSpawnSchedule(state.currentWave)
    return
  }
  // If fighting or countdown, ignore
}

/** Reset wave state to idle, despawn all zombies. Call after player respawns. */
export function resetToIdle(): void {
  state.phase = 'idle'
  state.currentWave = 0
  state.countdownValue = 0
  state.spawnSchedule = []
  state.nextSpawnIndex = 0
  despawnAllZombies()
}

function runCountdown(): void {
  if (state.phase !== 'countdown') return
  const now = getGameTime()
  const remaining = state.countdownEndTime - now
  if (remaining <= 0) {
    state.countdownValue = 0
    state.phase = 'fighting'
    state.waveStartTime = now
    state.spawnSchedule = buildSpawnSchedule(state.currentWave)
    state.nextSpawnIndex = 0
    return
  }
  const ceil = Math.ceil(remaining)
  if (ceil !== state.countdownValue) {
    state.countdownValue = ceil
  }
}

function runSpawns(): void {
  if (state.phase !== 'fighting' || state.nextSpawnIndex >= state.spawnSchedule.length) return
  const now = getGameTime()
  const elapsed = now - state.waveStartTime
  while (state.nextSpawnIndex < state.spawnSchedule.length) {
    const next = state.spawnSchedule[state.nextSpawnIndex]
    if (elapsed < next.at) break
    for (let i = 0; i < next.count; i++) spawnZombie()
    state.nextSpawnIndex++
  }
}

function checkWaveComplete(): void {
  if (state.phase !== 'fighting') return
  const allSpawned = state.nextSpawnIndex >= state.spawnSchedule.length
  const zombiesLeft = countZombiesAlive()
  if (allSpawned && zombiesLeft === 0) {
    if (state.currentWave >= MAX_WAVES) {
      state.phase = 'game_complete'
    } else {
      state.phase = 'wave_complete'
      state.waveCompleteEndTime = getGameTime() + WAVE_COMPLETE_DELAY
    }
  }
}

function runWaveCompleteDelay(): void {
  if (state.phase !== 'wave_complete' || state.currentWave >= MAX_WAVES) return
  if (getGameTime() < state.waveCompleteEndTime) return
  state.currentWave += 1
  state.phase = 'countdown'
  state.countdownValue = COUNTDOWN_SECONDS
  state.countdownEndTime = getGameTime() + COUNTDOWN_SECONDS
  state.nextSpawnIndex = 0
  state.spawnSchedule = buildSpawnSchedule(state.currentWave)
}

export function waveManagerSystem(_dt: number): void {
  runCountdown()
  runWaveCompleteDelay()
  runSpawns()
  checkWaveComplete()
}
