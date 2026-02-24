import { engine } from '@dcl/sdk/ecs'
import {
  CLIENT_BASE_GROUP_SIZE,
  CLIENT_GROUP_GROWTH_EVERY_WAVES,
  CLIENT_MAX_GROUP_SIZE,
  CLIENT_SPAWN_INTERVAL_SECONDS,
  QUICK_ZOMBIE_CHANCE,
  QUICK_ZOMBIE_UNLOCK_WAVE,
  TANK_ZOMBIE_CHANCE,
  TANK_ZOMBIE_UNLOCK_WAVE
} from '../shared/matchConfig'
import { WaveCyclePhase } from '../shared/matchRuntimeSchemas'
import { spawnQuickZombie, spawnTankZombie, spawnZombie } from '../zombie'
import { getLocalAddress, getLobbyState, getMatchRuntimeState } from './lobbyClient'

let spawnAccumulator = 0
let lastWaveCycleKey = ''

function isLocalPlayerInCurrentMatch(): boolean {
  const lobbyState = getLobbyState()
  const localAddress = getLocalAddress()
  if (!lobbyState || !localAddress) return false
  if (lobbyState.phase !== 'match_created') return false
  return lobbyState.players.some((p) => p.address === localAddress)
}

function getSpawnGroupSize(waveNumber: number): number {
  const growth = Math.floor(Math.max(0, waveNumber - 1) / CLIENT_GROUP_GROWTH_EVERY_WAVES)
  return Math.min(CLIENT_MAX_GROUP_SIZE, CLIENT_BASE_GROUP_SIZE + growth)
}

function spawnZombieByWave(waveNumber: number): void {
  const roll = Math.random()

  if (waveNumber >= TANK_ZOMBIE_UNLOCK_WAVE && roll < TANK_ZOMBIE_CHANCE) {
    spawnTankZombie()
    return
  }

  if (waveNumber >= QUICK_ZOMBIE_UNLOCK_WAVE && roll < QUICK_ZOMBIE_CHANCE) {
    spawnQuickZombie()
    return
  }

  spawnZombie()
}

function spawnGroupForWave(waveNumber: number): void {
  const groupSize = getSpawnGroupSize(waveNumber)
  for (let i = 0; i < groupSize; i++) {
    spawnZombieByWave(waveNumber)
  }
}

function matchWaveClientSystem(dt: number): void {
  const runtime = getMatchRuntimeState()
  if (!runtime || !runtime.isRunning || !isLocalPlayerInCurrentMatch()) {
    spawnAccumulator = 0
    lastWaveCycleKey = ''
    return
  }

  const waveCycleKey = `${runtime.waveNumber}:${runtime.cyclePhase}`
  if (waveCycleKey !== lastWaveCycleKey) {
    spawnAccumulator = 0
    lastWaveCycleKey = waveCycleKey
  }

  if (runtime.cyclePhase !== WaveCyclePhase.ACTIVE) return

  spawnAccumulator += dt
  while (spawnAccumulator >= CLIENT_SPAWN_INTERVAL_SECONDS) {
    spawnAccumulator -= CLIENT_SPAWN_INTERVAL_SECONDS
    spawnGroupForWave(runtime.waveNumber)
  }
}

export function initMatchWaveClientSystem(): void {
  engine.addSystem(matchWaveClientSystem, undefined, 'match-wave-client-system')
}
