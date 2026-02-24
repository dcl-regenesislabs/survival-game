import { room } from '../shared/messages'
import { WaveCyclePhase } from '../shared/matchRuntimeSchemas'
import { spawnQuickZombie, spawnTankZombie, spawnZombie } from '../zombie'
import { getLocalAddress, getLobbyState, getMatchRuntimeState } from './lobbyClient'

let isWaveSpawnListenerRegistered = false

function isLocalPlayerInCurrentMatch(): boolean {
  const lobbyState = getLobbyState()
  const localAddress = getLocalAddress()
  if (!lobbyState || !localAddress) return false
  if (lobbyState.phase !== 'match_created') return false
  return lobbyState.players.some((p) => p.address === localAddress)
}

function spawnGroupFromServer(data: { waveNumber: number; basicCount: number; quickCount: number; tankCount: number }): void {
  if (!isLocalPlayerInCurrentMatch()) return
  const runtime = getMatchRuntimeState()
  if (!runtime || !runtime.isRunning) return
  if (runtime.cyclePhase !== WaveCyclePhase.ACTIVE) return
  if (data.waveNumber !== runtime.waveNumber) return

  for (let i = 0; i < data.basicCount; i++) spawnZombie()
  for (let i = 0; i < data.quickCount; i++) spawnQuickZombie()
  for (let i = 0; i < data.tankCount; i++) spawnTankZombie()
}

export function initMatchWaveClientSystem(): void {
  if (isWaveSpawnListenerRegistered) return
  isWaveSpawnListenerRegistered = true
  room.onMessage('waveSpawnGroup', (data) => {
    spawnGroupFromServer(data)
  })
}
