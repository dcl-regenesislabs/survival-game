import { engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { room } from '../shared/messages'
import { getServerTime } from '../shared/timeSync'
import {
  applyZombieHealthUpdateByNetworkId,
  explodeZombieByNetworkId,
  despawnZombieByNetworkId,
  getZombiePositionByNetworkId,
  spawnExploderZombie,
  setZombieHitReporter,
  spawnQuickZombie,
  spawnTankZombie,
  spawnZombie,
  spawnZcRewardTextAtPosition
} from '../zombie'
import { getLocalAddress, getLobbyState } from './lobbyClient'
import { addZombieCoins, COINS_PER_KILL } from '../zombieCoins'

type ZombieType = 'basic' | 'quick' | 'tank' | 'exploder'

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
const pendingZombieHpById = new Map<string, number>()

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
    if (
      spawn.zombieType !== 'basic' &&
      spawn.zombieType !== 'quick' &&
      spawn.zombieType !== 'tank' &&
      spawn.zombieType !== 'exploder'
    ) continue
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
    case 'exploder':
      spawnExploderZombie(options)
      break
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
  const pendingHp = pendingZombieHpById.get(spawn.zombieId)
  if (typeof pendingHp === 'number') {
    applyZombieHealthUpdateByNetworkId(spawn.zombieId, pendingHp)
    pendingZombieHpById.delete(spawn.zombieId)
  }
}

function plannedSpawnSystem(): void {
  if (!isLocalPlayerInCurrentMatch()) {
    pendingSpawns = []
    pendingZombieHpById.clear()
    return
  }

  const nowMs = getServerTime()
  while (pendingSpawns.length > 0 && pendingSpawns[0].spawnAtMs <= nowMs) {
    const next = pendingSpawns.shift()
    if (!next) break
    spawnPlannedZombie(next)
  }
}

function requestZombieHitToServer(
  zombieId: string,
  damage: number,
  weaponType: 'gun' | 'shotgun' | 'minigun',
  shotSeq: number
): void {
  if (!zombieId) return
  if (!isLocalPlayerInCurrentMatch()) return
  void room.send('zombieHitRequest', { zombieId, damage, weaponType, shotSeq })
}

export function initMatchWaveClientSystem(): void {
  if (isWaveSpawnListenerRegistered) return
  isWaveSpawnListenerRegistered = true

  setZombieHitReporter(requestZombieHitToServer)

  room.onMessage('waveSpawnPlan', (data) => {
    queueWavePlan(data)
  })

  room.onMessage('zombieHealthChanged', (data) => {
    if (!applyZombieHealthUpdateByNetworkId(data.zombieId, data.hp)) {
      pendingZombieHpById.set(data.zombieId, data.hp)
    }
  })

  room.onMessage('zombieDied', (data) => {
    const zombiePos = getZombiePositionByNetworkId(data.zombieId)
    pendingSpawns = pendingSpawns.filter((spawn) => spawn.zombieId !== data.zombieId)
    spawnedZombieIds.delete(data.zombieId)
    pendingZombieHpById.delete(data.zombieId)
    if (data.killerAddress && data.killerAddress.toLowerCase() === getLocalAddress() && zombiePos) {
      addZombieCoins(COINS_PER_KILL)
      spawnZcRewardTextAtPosition(zombiePos, COINS_PER_KILL)
    }
    despawnZombieByNetworkId(data.zombieId)
  })

  room.onMessage('zombieExploded', (data) => {
    pendingSpawns = pendingSpawns.filter((spawn) => spawn.zombieId !== data.zombieId)
    spawnedZombieIds.delete(data.zombieId)
    pendingZombieHpById.delete(data.zombieId)
    explodeZombieByNetworkId(data.zombieId)
  })

  engine.addSystem(plannedSpawnSystem, undefined, 'planned-wave-spawn-client-system')
}
