import { engine } from '@dcl/sdk/ecs'
import { getGameTime, spawnZombie, spawnQuickZombie, spawnTankZombie, despawnAllZombies } from './zombie'
import { ZombieComponent } from './zombie'
import { resetZombieCoins } from './zombieCoins'
import { despawnAllBricks } from './brick'
import { getLobbyState } from './multiplayer/lobbyClient'

const MAX_WAVES = 100
const COUNTDOWN_SECONDS = 5 // Give players more time to prepare
const SPAWN_INTERVAL_SECONDS = 2 // Time between each spawn group

// Zombie type for spawn scheduling
type ZombieType = 'basic' | 'quick' | 'tank'

interface SpawnGroup {
  at: number // Time offset from wave start
  zombies: ZombieType[]
}

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
  spawnSchedule: SpawnGroup[]
  nextSpawnIndex: number
  matchPlayerCount: number
} = {
  phase: 'idle',
  currentWave: 0,
  countdownValue: 0,
  countdownEndTime: 0,
  waveCompleteEndTime: 0,
  waveStartTime: 0,
  spawnSchedule: [],
  nextSpawnIndex: 0,
  matchPlayerCount: 1
}

export function getCurrentWave(): number {
  return state.currentWave
}

export function getWaveUiState(): WaveUiState {
  const zombiesRemaining = countZombiesAlive()
  let message = ''
  const isBossWave = state.currentWave % 10 === 0
  
  switch (state.phase) {
    case 'idle':
      message = 'Press START to begin'
      break
    case 'countdown':
      message = state.countdownValue > 0 ? String(state.countdownValue) : 'GO!'
      break
    case 'fighting':
      message = isBossWave 
        ? `BOSS WAVE ${state.currentWave} - Zombies: ${zombiesRemaining}`
        : `Wave ${state.currentWave} - Zombies: ${zombiesRemaining}`
      break
    case 'wave_complete':
      if (state.currentWave >= MAX_WAVES) {
        message = 'ALL 100 WAVES COMPLETE! YOU WIN!'
      } else if (isBossWave) {
        message = 'BOSS DEFEATED! Next wave starting...'
      } else {
        message = `Wave ${state.currentWave} complete! Get ready...`
      }
      break
    case 'game_complete':
      message = 'ALL 100 WAVES COMPLETE! Press START to play again.'
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
  const isBossWave = state.currentWave % 10 === 0
  return isBossWave ? `BOSS WAVE ${state.currentWave} starts in` : `WAVE ${state.currentWave} starts in`
}

function countZombiesAlive(): number {
  let count = 0
  for (const [_entity] of engine.getEntitiesWith(ZombieComponent)) {
    count++
  }
  return count
}

/** Reads arena player count from lobby — only called once at match start. */
function getArenaPlayerCount(): number {
  return Math.max(1, getLobbyState()?.arenaPlayers.length ?? 1)
}

/**
 * Generate spawn schedule for a given wave.
 * Uses exponential scaling and varied compositions for engaging gameplay.
 * Zombie count scales with player count locked in at match start: +50% per additional player (1p=1x, 2p=1.5x, 3p=2x, 4p=2.5x).
 */
function buildSpawnSchedule(wave: number): SpawnGroup[] {
  const isBossWave = wave % 10 === 0
  const schedule: SpawnGroup[] = []
  
  // Calculate total zombie count (exponential growth with cap)
  // Formula: base * (1 + wave/10)^1.3
  let baseCount = 8
  if (wave <= 5) baseCount = 5
  else if (wave <= 10) baseCount = 6
  
  const scaleFactor = Math.pow(1 + wave / 10, 1.3)
  let totalZombies = Math.floor(baseCount * scaleFactor)

  // Scale with player count locked in at match start: +50% per additional player (1p=1x, 2p=1.5x, 3p=2x, 4p=2.5x)
  const playerMultiplier = 0.5 + state.matchPlayerCount * 0.5
  totalZombies = Math.floor(totalZombies * playerMultiplier)

  // Cap at reasonable numbers to avoid performance issues
  totalZombies = Math.min(totalZombies, 80)
  
  // Determine enemy composition based on wave
  const composition = getWaveComposition(wave, totalZombies, isBossWave)
  
  // Spread spawns over time for manageable combat
  const spawnGroups = isBossWave ? calculateBossSpawnGroups(composition) : calculateNormalSpawnGroups(composition)
  
  return spawnGroups
}

/**
 * Determine the mix of zombie types for this wave
 */
function getWaveComposition(wave: number, totalCount: number, isBossWave: boolean): ZombieType[] {
  const zombies: ZombieType[] = []
  
  if (isBossWave) {
    // Boss waves: Heavy on tanks, with supporting quick zombies
    const tankCount = Math.floor(totalCount * 0.4) // 40% tanks
    const quickCount = Math.floor(totalCount * 0.35) // 35% quick
    const basicCount = totalCount - tankCount - quickCount // Rest basic
    
    for (let i = 0; i < tankCount; i++) zombies.push('tank')
    for (let i = 0; i < quickCount; i++) zombies.push('quick')
    for (let i = 0; i < basicCount; i++) zombies.push('basic')
  } else if (wave <= 10) {
    // Early waves: Basic zombies only
    for (let i = 0; i < totalCount; i++) zombies.push('basic')
  } else if (wave <= 25) {
    // Waves 11-25: Introduce quick zombies
    const quickCount = Math.floor(totalCount * 0.25) // 25% quick
    const basicCount = totalCount - quickCount
    
    for (let i = 0; i < quickCount; i++) zombies.push('quick')
    for (let i = 0; i < basicCount; i++) zombies.push('basic')
  } else if (wave <= 50) {
    // Waves 26-50: All three types, balanced
    const tankCount = Math.floor(totalCount * 0.15) // 15% tanks
    const quickCount = Math.floor(totalCount * 0.35) // 35% quick
    const basicCount = totalCount - tankCount - quickCount
    
    for (let i = 0; i < tankCount; i++) zombies.push('tank')
    for (let i = 0; i < quickCount; i++) zombies.push('quick')
    for (let i = 0; i < basicCount; i++) zombies.push('basic')
  } else {
    // Waves 51+: Heavy emphasis on harder enemies
    const tankCount = Math.floor(totalCount * 0.30) // 30% tanks
    const quickCount = Math.floor(totalCount * 0.40) // 40% quick
    const basicCount = totalCount - tankCount - quickCount
    
    for (let i = 0; i < tankCount; i++) zombies.push('tank')
    for (let i = 0; i < quickCount; i++) zombies.push('quick')
    for (let i = 0; i < basicCount; i++) zombies.push('basic')
  }
  
  // Shuffle for variety
  return shuffleArray(zombies)
}

/**
 * Create spawn groups for normal waves - spread out over time
 */
function calculateNormalSpawnGroups(zombies: ZombieType[]): SpawnGroup[] {
  const groups: SpawnGroup[] = []
  const groupSize = Math.max(2, Math.min(5, Math.floor(zombies.length / 6))) // 2-5 per group
  
  let currentTime = 0
  for (let i = 0; i < zombies.length; i += groupSize) {
    const group = zombies.slice(i, i + groupSize)
    groups.push({ at: currentTime, zombies: group })
    currentTime += SPAWN_INTERVAL_SECONDS
  }
  
  return groups
}

/**
 * Create spawn groups for boss waves - more intense, faster spawns
 */
function calculateBossSpawnGroups(zombies: ZombieType[]): SpawnGroup[] {
  const groups: SpawnGroup[] = []
  
  // Boss waves: spawn tanks first as "bosses", then flood with others
  const tanks = zombies.filter(z => z === 'tank')
  const others = zombies.filter(z => z !== 'tank')
  
  // Tanks spawn first in small groups
  let currentTime = 0
  for (let i = 0; i < tanks.length; i += 2) {
    const group = tanks.slice(i, i + 2)
    groups.push({ at: currentTime, zombies: group })
    currentTime += SPAWN_INTERVAL_SECONDS * 1.5
  }
  
  // Then flood with quick/basic in larger groups
  const floodGroupSize = 6
  for (let i = 0; i < others.length; i += floodGroupSize) {
    const group = others.slice(i, i + floodGroupSize)
    groups.push({ at: currentTime, zombies: group })
    currentTime += SPAWN_INTERVAL_SECONDS * 0.8 // Faster spawns
  }
  
  return groups
}

/**
 * Shuffle array in place (Fisher-Yates algorithm)
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

/** Call when the player presses Start (Button3). Starts wave 1 if idle, or next wave if wave_complete; restarts from wave 1 if game_complete. */
export function onStartPressed(): void {
  if (state.phase === 'idle' || state.phase === 'game_complete') {
    resetZombieCoins()
    state.matchPlayerCount = getArenaPlayerCount()
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
  state.matchPlayerCount = 1
  despawnAllZombies()
  despawnAllBricks()
  resetZombieCoins()
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
    
    // Spawn each zombie in the group based on type
    for (const zombieType of next.zombies) {
      switch (zombieType) {
        case 'basic':
          spawnZombie()
          break
        case 'quick':
          spawnQuickZombie()
          break
        case 'tank':
          spawnTankZombie()
          break
      }
    }
    
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
