import { engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { room } from '../shared/messages'
import { getServerTime } from '../shared/timeSync'
import {
  despawnZombieByNetworkId,
  setZombieDeathReporter,
  spawnQuickZombie,
  spawnTankZombie,
  spawnZombie
} from '../zombie'
import { getLocalAddress, getLobbyState } from './lobbyClient'

type ZombieType = 'basic' | 'quick' | 'tank'

type PlannedSpawn = {
  zombieId: string
  zombieType: ZombieType
  spawnAtMs: number
  spawnX: number
  spawnY: number
  spawnZ: number
  waveNumber: number
}

let isWaveSpawnListenerRegistered = false
let pendingSpawns: PlannedSpawn[] = []
const spawnedZombieIds = new Set<string>()

function isLocalPlayerInCurrentMatch(): boolean {
  const lobbyState = getLobbyState()
  const localAddress = getLocalAddress()
  if (!lobbyState || !localAddress) return false
  if (lobbyState.phase !== 'match_created') return false
  return lobbyState.arenaPlayers.some((p) => p.address === localAddress)
}

function queueWavePlan(data: {
  waveNumber: number
  startAtMs: number
  intervalMs: number
  spawns: Array<{
    zombieId: string
    zombieType: string
    spawnX: number
    spawnY: number
    spawnZ: number
    spawnAtMs: number
  }>
}): void {
  if (!isLocalPlayerInCurrentMatch()) return

  pendingSpawns = pendingSpawns.filter((spawn) => spawn.waveNumber !== data.waveNumber)

  for (const spawn of data.spawns) {
    if (spawnedZombieIds.has(spawn.zombieId)) continue
    if (spawn.zombieType !== 'basic' && spawn.zombieType !== 'quick' && spawn.zombieType !== 'tank') continue
    pendingSpawns.push({
      zombieId: spawn.zombieId,
      zombieType: spawn.zombieType,
      spawnAtMs: spawn.spawnAtMs,
      spawnX: spawn.spawnX,
      spawnY: spawn.spawnY,
      spawnZ: spawn.spawnZ,
      waveNumber: data.waveNumber
    })
  }

  pendingSpawns.sort((a, b) => a.spawnAtMs - b.spawnAtMs)
}

function spawnPlannedZombie(spawn: PlannedSpawn): void {
  if (spawnedZombieIds.has(spawn.zombieId)) return
  const options = {
    networkId: spawn.zombieId,
    position: Vector3.create(spawn.spawnX, spawn.spawnY, spawn.spawnZ)
  }

  switch (spawn.zombieType) {
    case 'quick':
      spawnQuickZombie(options)
      break
    case 'tank':
      spawnTankZombie(options)
      break
    default:
      spawnZombie(options)
      break
  }

  spawnedZombieIds.add(spawn.zombieId)
}

function plannedSpawnSystem(): void {
  if (!isLocalPlayerInCurrentMatch()) {
    pendingSpawns = []
    return
  }

  const nowMs = getServerTime()
  while (pendingSpawns.length > 0 && pendingSpawns[0].spawnAtMs <= nowMs) {
    const next = pendingSpawns.shift()
    if (!next) break
    spawnPlannedZombie(next)
  }
}

function requestZombieDeathToServer(zombieId: string): void {
  if (!zombieId) return
  if (!isLocalPlayerInCurrentMatch()) return
  void room.send('zombieDieRequest', { zombieId })
}

export function initMatchWaveClientSystem(): void {
  if (isWaveSpawnListenerRegistered) return
  isWaveSpawnListenerRegistered = true

  setZombieDeathReporter(requestZombieDeathToServer)

  room.onMessage('waveSpawnPlan', (data) => {
    queueWavePlan(data)
  })

  room.onMessage('zombieDied', (data) => {
    pendingSpawns = pendingSpawns.filter((spawn) => spawn.zombieId !== data.zombieId)
    spawnedZombieIds.delete(data.zombieId)
    despawnZombieByNetworkId(data.zombieId)
  })

  engine.addSystem(plannedSpawnSystem, undefined, 'planned-wave-spawn-client-system')
}
