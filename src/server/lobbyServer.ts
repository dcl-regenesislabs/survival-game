import { engine, AvatarBase, PlayerIdentityData, Transform } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { LobbyPhase, LobbyStateComponent, LobbyPlayer } from '../shared/lobbySchemas'
import { MatchRuntimeStateComponent, WaveCyclePhase } from '../shared/matchRuntimeSchemas'
import { room } from '../shared/messages'
import {
  CLIENT_BASE_GROUP_SIZE,
  CLIENT_GROUP_GROWTH_EVERY_WAVES,
  CLIENT_MAX_GROUP_SIZE,
  CLIENT_SPAWN_INTERVAL_SECONDS,
  EXPLODER_ZOMBIE_BASE_CHANCE,
  EXPLODER_ZOMBIE_CHANCE_2,
  EXPLODER_ZOMBIE_CHANCE_3,
  EXPLODER_ZOMBIE_CHANCE_4,
  EXPLODER_ZOMBIE_CHANCE_WAVE_2,
  EXPLODER_ZOMBIE_CHANCE_WAVE_3,
  EXPLODER_ZOMBIE_CHANCE_WAVE_4,
  EXPLODER_ZOMBIE_COOLDOWN_SECONDS,
  EXPLODER_ZOMBIE_MAX_SIMULTANEOUS_EARLY,
  EXPLODER_ZOMBIE_MAX_SIMULTANEOUS_LATE,
  EXPLODER_ZOMBIE_MAX_SIMULTANEOUS_LATE_WAVE,
  EXPLODER_ZOMBIE_UNLOCK_WAVE,
  MATCH_MAX_PLAYERS,
  QUICK_ZOMBIE_CHANCE,
  QUICK_ZOMBIE_UNLOCK_WAVE,
  TANK_ZOMBIE_CHANCE,
  TANK_ZOMBIE_UNLOCK_WAVE,
  WAVE_ACTIVE_SECONDS,
  WAVE_REST_SECONDS
} from '../shared/matchConfig'
import {
  ArenaWeaponType,
  DEFAULT_LOADOUT_WEAPON_BY_TIER,
  LoadoutWeaponId,
  LOADOUT_WEAPON_DEFINITIONS,
  getLoadoutWeaponDefinition
} from '../shared/loadoutCatalog'
import { createPlayerProgressStore } from './storage/playerProgress'
import { getServerTime } from '../shared/timeSync'
import {
  ARENA_CENTER_X,
  ARENA_CENTER_Z,
  ARENA_SPAWN_MAX_X,
  ARENA_SPAWN_MAX_Z,
  ARENA_SPAWN_MIN_X,
  ARENA_SPAWN_MIN_Z
} from '../shared/arenaConfig'
import {
  LAVA_DAMAGE_INTERVAL_MS,
  shouldSpawnLavaForWave,
  type LavaHazardTileState
} from '../shared/lavaHazardConfig'
import { buildLavaHazardsForWave } from './lavaHazardPatterns'

let lobbyEntity: ReturnType<typeof engine.addEntity> | null = null
let matchRuntimeEntity: ReturnType<typeof engine.addEntity> | null = null
const playerProgressStore = createPlayerProgressStore()
const VALID_WEAPON_IDS = new Set(LOADOUT_WEAPON_DEFINITIONS.map((w) => w.id))
const PLAYER_PROGRESS_AUTOSAVE_SECONDS = 20
const PLAYER_MAX_HP = 5
const PLAYER_RESPAWN_SECONDS = 5
const PLAYER_DAMAGE_REQUEST_COOLDOWN_MS = 250
const PLAYER_HEAL_REQUEST_COOLDOWN_MS = 250
const HEALTH_POTION_HEAL_AMOUNT = PLAYER_MAX_HP
const HEALTH_POTION_DROP_CHANCE = 0.02
const RAGE_POTION_DROP_CHANCE = 0.015
const SPEED_POTION_DROP_CHANCE = 0.015
const RAGE_SHIELD_DURATION_MS = 10_000
const SPEED_POTION_DURATION_MS = 10_000
const SPEED_FIRE_RATE_MULTIPLIER = 2
const RAGE_SHIELD_DAMAGE = 1
const RAGE_SHIELD_RADIUS = 1.6
const RAGE_SHIELD_HIT_COOLDOWN_MS = 500
const POTION_LIFETIME_MS = 20_000
const POTION_PICKUP_RADIUS = 2.5
const POTION_MIN_SEPARATION = 1.75
const POTION_POSITION_SEARCH_ATTEMPTS = 16
const POTION_POSITION_RING_STEP = 0.7
const LAVA_BATCH_SIZE = 96
const DISCONNECTED_PLAYER_GRACE_MS = 3000
const DISCONNECTED_PLAYER_RECONCILE_INTERVAL_SECONDS = 0.5
const SHOT_RATE_LIMIT_MS_BY_WEAPON: Record<ArenaWeaponType, number> = {
  gun: 450,
  shotgun: 450,
  minigun: 120
}
const ZOMBIE_HITS_ALLOWED_PER_SHOT: Record<ArenaWeaponType, number> = {
  gun: 1,
  shotgun: 3,
  minigun: 1
}
const ZOMBIE_MAX_HP_BY_TYPE: Record<ZombieType, number> = {
  basic: 3,
  quick: 2,
  tank: 10,
  exploder: 15
}
const AUTO_TELEPORT_COUNTDOWN_SECONDS = 5
const ARENA_WARNING_SECONDS = 5
const TEAM_WIPE_UI_DELAY_MS = 2000
const TEAM_WIPE_TELEPORT_DELAY_MS = 3000
const ARENA_TELEPORT_POSITION = { x: ARENA_CENTER_X, y: 0, z: ARENA_CENTER_Z }
const ARENA_TELEPORT_LOOK_AT = { x: ARENA_CENTER_X, y: 1, z: ARENA_CENTER_Z + 1 }
const LOBBY_RETURN_POSITION = { x: 90, y: 3, z: 32 }
const LOBBY_RETURN_LOOK_AT = { x: 106.75, y: 1, z: 32 }
const GOLD_WAVE_MILESTONES: Array<{ wave: number; gold: number }> = [
  { wave: 4, gold: 1 },
  { wave: 11, gold: 2 },
  { wave: 21, gold: 3 },
  { wave: 35, gold: 5 }
]

type ZombieType = 'basic' | 'quick' | 'tank' | 'exploder'
type PotionType = 'health' | 'rage' | 'speed'
type WavePlanSpawn = {
  zombieId: string
  zombieType: ZombieType
  spawnX: number
  spawnY: number
  spawnZ: number
  spawnAtMs: number
}
type ZombieSpawnState = {
  zombieType: ZombieType
  hp: number
  spawnX: number
  spawnY: number
  spawnZ: number
  spawnAtMs: number
}
type PlayerCombatState = {
  hp: number
  isDead: boolean
  respawnAtMs: number
  lastDamageRequestAtMs: number
  lastHealRequestAtMs: number
  lastLavaDamageAtMs: number
  rageShieldEndAtMs: number
  speedEndAtMs: number
}
type ActivePotionState = {
  potionId: string
  potionType: PotionType
  positionX: number
  positionY: number
  positionZ: number
  expiresAtMs: number
}
type ActiveLavaHazardState = LavaHazardTileState
type ScheduledLavaHazardState = LavaHazardTileState
type PendingTeamWipeReturn = {
  players: LobbyPlayer[]
  executeAtMs: number
}

let nextZombieSequence = 0
let nextPotionSequence = 0
let nextLavaSequence = 0
const zombieSpawnAtById = new Map<string, ZombieSpawnState>()
const deadZombieIds = new Set<string>()
const explodedZombieIds = new Set<string>()
const activePotionsById = new Map<string, ActivePotionState>()
const scheduledLavaHazardsById = new Map<string, ScheduledLavaHazardState>()
const activeLavaHazardsById = new Map<string, ActiveLavaHazardState>()
const loadedProfileAddresses = new Set<string>()
const awardedWaveGoldMilestones = new Set<number>()
const playerCombatStateByAddress = new Map<string, PlayerCombatState>()
const lastShotAtMsByPlayerAndWeapon = new Map<string, number>()
const zombieHitAllowanceByShotKey = new Map<string, number>()
const lastRageShieldHitAtMsByPlayerAndZombie = new Map<string, number>()
const explosiveZombieDamageByPlayerKey = new Set<string>()
const disconnectedLobbyPlayerSinceMs = new Map<string, number>()
const arenaWeaponByAddress = new Map<string, { weaponType: ArenaWeaponType; upgradeLevel: number }>()
let disconnectedPlayerReconcileAccumulator = 0
let isDisconnectReconcileInFlight = false
let pendingTeamWipeReturn: PendingTeamWipeReturn | null = null

function logLobbyServerEvent(message: string): void {
  console.log(`[Server][Lobby] ${message}`)
}

function getOwnedWeaponIds(address: string): LoadoutWeaponId[] {
  const defaultOwnedWeaponIds = Object.values(DEFAULT_LOADOUT_WEAPON_BY_TIER).filter(
    (weaponId): weaponId is LoadoutWeaponId => !!weaponId
  )
  const progress = playerProgressStore.get(address)
  if (!progress) return defaultOwnedWeaponIds

  const validIds = VALID_WEAPON_IDS
  const ownedWeaponIds: LoadoutWeaponId[] = [...defaultOwnedWeaponIds]

  for (const tier of ['tier1', 'tier2', 'tier3', 'tier4'] as const) {
    for (const weaponId of progress.weapons.ownedByTier[tier]) {
      if (validIds.has(weaponId as LoadoutWeaponId) && !ownedWeaponIds.includes(weaponId as LoadoutWeaponId)) {
        ownedWeaponIds.push(weaponId as LoadoutWeaponId)
      }
    }
  }
  return ownedWeaponIds
}

function isArenaWeaponType(value: string): value is ArenaWeaponType {
  return value === 'gun' || value === 'shotgun' || value === 'minigun'
}

function getZombieMaxHp(zombieType: ZombieType): number {
  return ZOMBIE_MAX_HP_BY_TYPE[zombieType]
}

function getShotAllowanceKey(address: string, weaponType: ArenaWeaponType, shotSeq: number): string {
  return `${address.toLowerCase()}:${weaponType}:${Math.floor(shotSeq)}`
}

function getRageShieldHitKey(address: string, zombieId: string): string {
  return `${address.toLowerCase()}:${zombieId}`
}

function getExplosiveZombieDamageKey(address: string, zombieId: string): string {
  return `${address.toLowerCase()}:${zombieId}`
}

function getEquippedWeaponIds(address: string): LoadoutWeaponId[] {
  const progress = playerProgressStore.get(address)
  const defaultEquippedWeaponIds = Object.values(DEFAULT_LOADOUT_WEAPON_BY_TIER).filter(
    (weaponId): weaponId is LoadoutWeaponId => !!weaponId
  )
  if (!progress) return defaultEquippedWeaponIds

  const validIds = VALID_WEAPON_IDS
  const equippedWeaponIds: LoadoutWeaponId[] = []

  for (const tier of ['tier1', 'tier2', 'tier3', 'tier4'] as const) {
    const id = progress.weapons.equippedByTier[tier]
    if (id && validIds.has(id as LoadoutWeaponId) && !equippedWeaponIds.includes(id as LoadoutWeaponId)) {
      equippedWeaponIds.push(id as LoadoutWeaponId)
    }
  }

  for (const [tierKey, weaponId] of Object.entries(DEFAULT_LOADOUT_WEAPON_BY_TIER)) {
    if (!weaponId) continue
    const alreadyEquippedInTier = equippedWeaponIds.some((equippedWeaponId) => {
      const weapon = getLoadoutWeaponDefinition(equippedWeaponId)
      return weapon?.tierKey === tierKey
    })
    if (!alreadyEquippedInTier) {
      equippedWeaponIds.push(weaponId)
    }
  }

  return equippedWeaponIds
}

function sendPlayerLoadoutState(address: string): void {
  const normalizedAddress = address.toLowerCase()
  const progress = playerProgressStore.get(normalizedAddress)
  if (!progress) return

  void room.send('playerLoadoutState', {
    address: normalizedAddress,
    gold: progress.profile.gold,
    ownedWeaponIds: getOwnedWeaponIds(normalizedAddress),
    equippedWeaponIds: getEquippedWeaponIds(normalizedAddress)
  })
}

function getPlayerArenaWeaponState(address: string): { weaponType: ArenaWeaponType; upgradeLevel: number } {
  return arenaWeaponByAddress.get(address.toLowerCase()) ?? { weaponType: 'gun', upgradeLevel: 1 }
}

const GUN_UPGRADE_DAMAGE: Record<number, number> = { 1: 1, 2: 1, 3: 2 }

function getWeaponHitDamage(address: string, weaponType: ArenaWeaponType): number {
  if (weaponType === 'gun') {
    const { upgradeLevel } = getPlayerArenaWeaponState(address)
    return GUN_UPGRADE_DAMAGE[upgradeLevel] ?? 1
  }
  return 1
}

function sendPlayerArenaWeaponState(address: string, to?: string[]): void {
  const normalizedAddress = address.toLowerCase()
  const state = getPlayerArenaWeaponState(normalizedAddress)
  const payload = {
    address: normalizedAddress,
    weaponType: state.weaponType,
    upgradeLevel: state.upgradeLevel
  }
  if (to) {
    void room.send('playerArenaWeaponState', payload, { to })
    return
  }
  void room.send('playerArenaWeaponState', payload)
}

function sendPlayerPowerupState(address: string, to?: string[]): void {
  const normalizedAddress = address.toLowerCase()
  const state = getOrCreatePlayerCombatState(normalizedAddress)
  const payload = {
    address: normalizedAddress,
    rageShieldEndAtMs: state.rageShieldEndAtMs,
    speedEndAtMs: state.speedEndAtMs
  }
  if (to) {
    void room.send('playerPowerupState', payload, { to })
    return
  }
  void room.send('playerPowerupState', payload)
}

function sendArenaWeaponStatesTo(address: string): void {
  const normalizedAddress = address.toLowerCase()
  const lobbyState = getLobbyState()
  for (const player of lobbyState.arenaPlayers) {
    sendPlayerArenaWeaponState(player.address, [normalizedAddress])
  }
}

function sendPowerupStatesTo(address: string): void {
  const normalizedAddress = address.toLowerCase()
  const lobbyState = getLobbyState()
  for (const player of lobbyState.arenaPlayers) {
    sendPlayerPowerupState(player.address, [normalizedAddress])
  }
}

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
      players: [],
      arenaPlayers: [],
      countdownEndTimeMs: 0,
      arenaIntroEndTimeMs: 0
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
  explodedZombieIds.clear()
  explosiveZombieDamageByPlayerKey.clear()
  runtime.zombiesAlive = 0
  runtime.zombiesPlanned = 0
  awardedWaveGoldMilestones.clear()
  lastRageShieldHitAtMsByPlayerAndZombie.clear()
  clearActivePotions(true)
  clearAllLavaHazards()
}

function getOrCreatePlayerCombatState(address: string): PlayerCombatState {
  const normalizedAddress = address.toLowerCase()
  const cached = playerCombatStateByAddress.get(normalizedAddress)
  if (cached) return cached
  const created: PlayerCombatState = {
    hp: PLAYER_MAX_HP,
    isDead: false,
    respawnAtMs: 0,
    lastDamageRequestAtMs: 0,
    lastHealRequestAtMs: 0,
    lastLavaDamageAtMs: 0,
    rageShieldEndAtMs: 0,
    speedEndAtMs: 0
  }
  playerCombatStateByAddress.set(normalizedAddress, created)
  return created
}

function resetPlayerCombatState(address: string): void {
  const state = getOrCreatePlayerCombatState(address)
  const normalizedAddress = address.toLowerCase()
  state.hp = PLAYER_MAX_HP
  state.isDead = false
  state.respawnAtMs = 0
  state.lastDamageRequestAtMs = 0
  state.lastHealRequestAtMs = 0
  state.lastLavaDamageAtMs = 0
  state.rageShieldEndAtMs = 0
  state.speedEndAtMs = 0
  arenaWeaponByAddress.set(normalizedAddress, { weaponType: 'gun', upgradeLevel: 1 })
  sendPlayerPowerupState(normalizedAddress)
}

function removePlayerCombatState(address: string): void {
  const normalizedAddress = address.toLowerCase()
  playerCombatStateByAddress.delete(normalizedAddress)
  arenaWeaponByAddress.delete(normalizedAddress)
}

function clearPlayerShotRateLimitState(address: string): void {
  const normalizedAddress = address.toLowerCase()
  for (const weaponType of Object.keys(SHOT_RATE_LIMIT_MS_BY_WEAPON) as ArenaWeaponType[]) {
    lastShotAtMsByPlayerAndWeapon.delete(`${normalizedAddress}:${weaponType}`)
  }
  for (const shotKey of zombieHitAllowanceByShotKey.keys()) {
    if (shotKey.startsWith(`${normalizedAddress}:`)) {
      zombieHitAllowanceByShotKey.delete(shotKey)
    }
  }
}

function sendPlayerHealthState(address: string): void {
  const normalizedAddress = address.toLowerCase()
  const state = getOrCreatePlayerCombatState(normalizedAddress)
  void room.send('playerHealthState', {
    address: normalizedAddress,
    hp: state.hp,
    isDead: state.isDead,
    respawnAtMs: state.respawnAtMs
  })
}

function distanceXZ(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx
  const dz = az - bz
  return Math.sqrt(dx * dx + dz * dz)
}

function getPlayerPosition(address: string): { x: number; y: number; z: number } | null {
  const normalizedAddress = address.toLowerCase()
  for (const [_entity, identity, transform] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
    if (identity.address.toLowerCase() !== normalizedAddress) continue
    return {
      x: transform.position.x,
      y: transform.position.y,
      z: transform.position.z
    }
  }
  return null
}

function sendPotionSpawn(potion: ActivePotionState, to?: string[]): void {
  if (to && to.length === 0) return
  const payload = {
    potionId: potion.potionId,
    potionType: potion.potionType,
    positionX: potion.positionX,
    positionY: potion.positionY,
    positionZ: potion.positionZ,
    expiresAtMs: potion.expiresAtMs
  }
  if (to) {
    void room.send('potionSpawned', payload, { to })
    return
  }
  void room.send('potionSpawned', payload)
}

function sendActivePotionsTo(address: string): void {
  const normalizedAddress = address.toLowerCase()
  for (const potion of activePotionsById.values()) {
    sendPotionSpawn(potion, [normalizedAddress])
  }
}

function sendLavaHazardSpawnBatches(hazards: LavaHazardTileState[], targets?: string[]): void {
  if (hazards.length === 0) return
  for (let index = 0; index < hazards.length; index += LAVA_BATCH_SIZE) {
    const payload = { hazards: hazards.slice(index, index + LAVA_BATCH_SIZE) }
    if (targets && targets.length > 0) {
      void room.send('lavaHazardsSpawned', payload, { to: targets })
    } else {
      void room.send('lavaHazardsSpawned', payload)
    }
  }
}

function sendLavaHazardExpiredBatches(lavaIds: string[]): void {
  if (lavaIds.length === 0) return
  for (let index = 0; index < lavaIds.length; index += LAVA_BATCH_SIZE) {
    void room.send('lavaHazardsExpired', {
      lavaIds: lavaIds.slice(index, index + LAVA_BATCH_SIZE)
    })
  }
}

function sendActiveLavaHazardsTo(address: string): void {
  const normalizedAddress = address.toLowerCase()
  sendLavaHazardSpawnBatches([...activeLavaHazardsById.values()], [normalizedAddress])
}

function clearActivePotions(notifyClients: boolean): void {
  if (activePotionsById.size === 0) return
  activePotionsById.clear()
  if (notifyClients) {
    void room.send('potionsCleared', {})
  }
}

function clampPotionCoordinate(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function isPotionPositionFree(
  positionX: number,
  positionZ: number,
  occupiedPositions: Array<{ x: number; z: number }>
): boolean {
  for (const occupied of occupiedPositions) {
    if (distanceXZ(positionX, positionZ, occupied.x, occupied.z) < POTION_MIN_SEPARATION) return false
  }
  return true
}

function getAvailablePotionPosition(
  originX: number,
  originY: number,
  originZ: number,
  occupiedPositions: Array<{ x: number; z: number }>
): { positionX: number; positionY: number; positionZ: number } {
  const allOccupiedPositions = [
    ...occupiedPositions,
    ...[...activePotionsById.values()].map((potion) => ({ x: potion.positionX, z: potion.positionZ }))
  ]

  if (isPotionPositionFree(originX, originZ, allOccupiedPositions)) {
    return { positionX: originX, positionY: originY, positionZ: originZ }
  }

  const angleOffset = Math.random() * Math.PI * 2
  for (let attempt = 0; attempt < POTION_POSITION_SEARCH_ATTEMPTS; attempt += 1) {
    const ring = Math.floor(attempt / 4) + 1
    const angle = angleOffset + attempt * ((Math.PI * 2) / 4)
    const radius = POTION_POSITION_RING_STEP * ring
    const candidateX = clampPotionCoordinate(originX + Math.cos(angle) * radius, ARENA_SPAWN_MIN_X, ARENA_SPAWN_MAX_X)
    const candidateZ = clampPotionCoordinate(originZ + Math.sin(angle) * radius, ARENA_SPAWN_MIN_Z, ARENA_SPAWN_MAX_Z)
    if (isPotionPositionFree(candidateX, candidateZ, allOccupiedPositions)) {
      return { positionX: candidateX, positionY: originY, positionZ: candidateZ }
    }
  }

  const fallbackAngle = angleOffset + Math.random() * Math.PI * 2
  const fallbackRadius = POTION_POSITION_RING_STEP * (Math.floor(POTION_POSITION_SEARCH_ATTEMPTS / 4) + 1)
  return {
    positionX: clampPotionCoordinate(originX + Math.cos(fallbackAngle) * fallbackRadius, ARENA_SPAWN_MIN_X, ARENA_SPAWN_MAX_X),
    positionY: originY,
    positionZ: clampPotionCoordinate(originZ + Math.sin(fallbackAngle) * fallbackRadius, ARENA_SPAWN_MIN_Z, ARENA_SPAWN_MAX_Z)
  }
}

function spawnPotionAt(positionX: number, positionY: number, positionZ: number, potionType: PotionType): void {
  nextPotionSequence += 1
  const potion: ActivePotionState = {
    potionId: `p${nextPotionSequence}`,
    potionType,
    positionX,
    positionY,
    positionZ,
    expiresAtMs: getServerTime() + POTION_LIFETIME_MS
  }
  activePotionsById.set(potion.potionId, potion)
  sendPotionSpawn(potion)
}

function trySpawnPotionDrops(positionX: number, positionY: number, positionZ: number): void {
  const occupiedPositions: Array<{ x: number; z: number }> = []

  if (Math.random() < HEALTH_POTION_DROP_CHANCE) {
    const spawn = getAvailablePotionPosition(positionX, positionY, positionZ, occupiedPositions)
    spawnPotionAt(spawn.positionX, spawn.positionY, spawn.positionZ, 'health')
    occupiedPositions.push({ x: spawn.positionX, z: spawn.positionZ })
  }
  if (Math.random() < RAGE_POTION_DROP_CHANCE) {
    const spawn = getAvailablePotionPosition(positionX, positionY, positionZ, occupiedPositions)
    spawnPotionAt(spawn.positionX, spawn.positionY, spawn.positionZ, 'rage')
    occupiedPositions.push({ x: spawn.positionX, z: spawn.positionZ })
  }
  if (Math.random() < SPEED_POTION_DROP_CHANCE) {
    const spawn = getAvailablePotionPosition(positionX, positionY, positionZ, occupiedPositions)
    spawnPotionAt(spawn.positionX, spawn.positionY, spawn.positionZ, 'speed')
    occupiedPositions.push({ x: spawn.positionX, z: spawn.positionZ })
  }
}

function isRageShieldActive(state: PlayerCombatState, now: number): boolean {
  return state.rageShieldEndAtMs > now
}

function getPlayerFireRateMultiplier(state: PlayerCombatState, now: number): number {
  return state.speedEndAtMs > now ? SPEED_FIRE_RATE_MULTIPLIER : 1
}

function expirePotions(now: number): void {
  for (const [potionId, potion] of activePotionsById) {
    if (potion.expiresAtMs > now) continue
    activePotionsById.delete(potionId)
    void room.send('potionExpired', { potionId })
  }
}

function getNextLavaHazardId(): string {
  nextLavaSequence += 1
  return `l${nextLavaSequence}`
}

function queueLavaHazardsForWave(waveNumber: number, now: number): void {
  if (!shouldSpawnLavaForWave(waveNumber)) return
  const hazards = buildLavaHazardsForWave(waveNumber, now, getNextLavaHazardId)
  for (const lava of hazards) {
    scheduledLavaHazardsById.set(lava.lavaId, lava)
  }
}

function spawnScheduledLavaHazards(now: number): void {
  const hazardsToSpawn: LavaHazardTileState[] = []
  for (const [lavaId, lava] of scheduledLavaHazardsById) {
    if (lava.warningAtMs > now) continue
    scheduledLavaHazardsById.delete(lavaId)
    activeLavaHazardsById.set(lavaId, lava)
    hazardsToSpawn.push(lava)
  }
  sendLavaHazardSpawnBatches(hazardsToSpawn)
}

function expireLavaHazards(now: number): void {
  const expiredLavaIds: string[] = []
  for (const [lavaId, lava] of activeLavaHazardsById) {
    if (lava.expiresAtMs > now) continue
    activeLavaHazardsById.delete(lavaId)
    expiredLavaIds.push(lavaId)
  }
  sendLavaHazardExpiredBatches(expiredLavaIds)
}

function clearAllLavaHazards(): void {
  if (scheduledLavaHazardsById.size === 0 && activeLavaHazardsById.size === 0) return
  scheduledLavaHazardsById.clear()
  activeLavaHazardsById.clear()
  void room.send('lavaHazardsCleared', {})
}

function applyZombieDamage(zombieId: string, damage: number, killerAddress: string, now: number): boolean {
  const normalizedAddress = killerAddress.toLowerCase()
  const runtime = getMatchRuntimeMutable()
  const spawnState = zombieSpawnAtById.get(zombieId)
  if (!spawnState) return false
  if (spawnState.spawnAtMs > now) return false

  const amount = Math.max(1, Math.floor(damage))
  spawnState.hp = Math.max(0, spawnState.hp - amount)

  if (spawnState.hp > 0) {
    void room.send('zombieHealthChanged', { zombieId, hp: spawnState.hp })
    return true
  }

  zombieSpawnAtById.delete(zombieId)
  deadZombieIds.delete(zombieId)
  explodedZombieIds.delete(zombieId)
  recomputeZombiesAlive(runtime, now)
  void room.send('zombieDied', { zombieId, killerAddress: normalizedAddress })
  trySpawnPotionDrops(spawnState.spawnX, spawnState.spawnY, spawnState.spawnZ)
  return true
}

function explodeZombie(zombieId: string, now: number): boolean {
  const runtime = getMatchRuntimeMutable()
  const spawnState = zombieSpawnAtById.get(zombieId)
  if (!spawnState) return false
  if (spawnState.spawnAtMs > now) return false
  if (spawnState.zombieType !== 'exploder') return false

  zombieSpawnAtById.delete(zombieId)
  deadZombieIds.delete(zombieId)
  explodedZombieIds.add(zombieId)
  recomputeZombiesAlive(runtime, now)
  void room.send('zombieExploded', { zombieId })
  return true
}

function applyExplosionDamageToPlayer(address: string, zombieId: string, requestedAmount: number, now: number): void {
  const normalizedAddress = address.toLowerCase()
  const state = getOrCreatePlayerCombatState(normalizedAddress)
  if (state.isDead) return

  const hitKey = getExplosiveZombieDamageKey(normalizedAddress, zombieId)
  if (explosiveZombieDamageByPlayerKey.has(hitKey)) return
  if (!explodedZombieIds.has(zombieId)) return

  explosiveZombieDamageByPlayerKey.add(hitKey)
  const amount = Math.max(1, Math.min(PLAYER_MAX_HP, Math.floor(requestedAmount)))
  state.lastDamageRequestAtMs = now
  state.hp = Math.max(0, state.hp - amount)
  if (state.hp <= 0) {
    state.isDead = true
    state.respawnAtMs = now + PLAYER_RESPAWN_SECONDS * 1000
  }
  sendPlayerHealthState(normalizedAddress)
}

function sendPlayerHealthStatesForLobbyPlayers(players: LobbyPlayer[]): void {
  for (const player of players) {
    sendPlayerHealthState(player.address)
  }
}

function areAllLobbyPlayersDead(players: LobbyPlayer[]): boolean {
  if (!players.length) return false
  for (const player of players) {
    const state = getOrCreatePlayerCombatState(player.address)
    if (!state.isDead) return false
  }
  return true
}

function endMatchAndReturnToLobby(message: string): void {
  if (pendingTeamWipeReturn) return
  const lobby = getLobbyStateMutable()
  const players = [...lobby.arenaPlayers]
  if (!players.length) return

  lobby.countdownEndTimeMs = 0
  lobby.arenaIntroEndTimeMs = 0
  resetMatchRuntime()
  pendingTeamWipeReturn = {
    players,
    executeAtMs: getServerTime() + TEAM_WIPE_UI_DELAY_MS + TEAM_WIPE_TELEPORT_DELAY_MS
  }

  void room.send('lobbyEvent', {
    type: 'team_wipe',
    message
  })
}

function finalizePendingTeamWipeReturn(): void {
  if (!pendingTeamWipeReturn) return
  const { players } = pendingTeamWipeReturn
  pendingTeamWipeReturn = null
  setPlayers([])

  for (const player of players) {
    resetPlayerCombatState(player.address)
    sendPlayerHealthState(player.address)
    sendPlayerArenaWeaponState(player.address)
  }

  sendLobbyReturnTeleport(players)
}

function resetArenaToLobby(message: string): void {
  pendingTeamWipeReturn = null
  resetMatchToLobbyKeepingPlayers()
  logLobbyServerEvent(`ArenaResetToLobby ${message}`)
  void room.send('lobbyEvent', {
    type: 'lobby',
    message
  })
}

function recomputeZombiesAlive(runtime: ReturnType<typeof getMatchRuntimeMutable>, nowMs: number): void {
  let alive = 0
  for (const [_zombieId, spawnState] of zombieSpawnAtById) {
    if (spawnState.spawnAtMs > nowMs) continue
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
  arenaWeaponByAddress.clear()
}

function resetMatchToLobbyKeepingPlayers(): void {
  pendingTeamWipeReturn = null
  const lobby = getLobbyStateMutable()
  lobby.phase = LobbyPhase.LOBBY
  lobby.matchId = ''
  lobby.arenaPlayers = []
  lobby.countdownEndTimeMs = 0
  lobby.arenaIntroEndTimeMs = 0
  resetMatchRuntime()
}

function cancelArenaAutoTeleportCountdown(): void {
  const lobby = getLobbyStateMutable()
  if (lobby.countdownEndTimeMs === 0) return
  lobby.countdownEndTimeMs = 0
  logLobbyServerEvent('ArenaAutoTeleportCountdownCancelled')
}

function cancelArenaIntroCountdown(): void {
  const lobby = getLobbyStateMutable()
  if (lobby.arenaIntroEndTimeMs === 0) return
  lobby.arenaIntroEndTimeMs = 0
  logLobbyServerEvent('ArenaIntroCountdownCancelled')
}

function getLobbyState() {
  const mutable = getLobbyStateMutable()
  return {
    phase: mutable.phase,
    matchId: mutable.matchId,
    hostAddress: mutable.hostAddress,
    players: [...mutable.players],
    arenaPlayers: [...mutable.arenaPlayers],
    countdownEndTimeMs: mutable.countdownEndTimeMs,
    arenaIntroEndTimeMs: mutable.arenaIntroEndTimeMs
  }
}

function setPlayers(players: LobbyPlayer[]) {
  const state = getLobbyStateMutable()
  state.players = players
  if (players.length === 0) {
    state.hostAddress = ''
    state.phase = LobbyPhase.LOBBY
    state.matchId = ''
    state.arenaPlayers = []
    state.countdownEndTimeMs = 0
    state.arenaIntroEndTimeMs = 0
    resetMatchRuntime()
  } else if (!players.find((p) => p.address === state.hostAddress)) {
    state.hostAddress = players[0].address
  }
}

function setArenaPlayers(players: LobbyPlayer[]) {
  const state = getLobbyStateMutable()
  state.arenaPlayers = players
}

function isPlayerInLobby(address: string): boolean {
  const state = getLobbyState()
  return state.players.some((p) => p.address === address.toLowerCase())
}

function isPlayerInArena(address: string): boolean {
  const state = getLobbyState()
  return state.arenaPlayers.some((p) => p.address === address.toLowerCase())
}

function isMatchJoinLocked(): boolean {
  const lobby = getLobbyState()
  if (lobby.phase !== LobbyPhase.MATCH_CREATED) return false

  const runtime = getMatchRuntimeMutable()
  return runtime.isRunning || lobby.arenaIntroEndTimeMs > 0
}

async function ensurePlayerLoadedAndInLobby(address: string): Promise<void> {
  const normalizedAddress = address.toLowerCase()
  await ensurePlayerProfileLoaded(normalizedAddress)
  addPlayerToLobby(normalizedAddress)
}

async function ensurePlayerProfileLoaded(address: string): Promise<void> {
  const normalizedAddress = address.toLowerCase()
  if (loadedProfileAddresses.has(normalizedAddress)) {
    sendPlayerLoadoutState(normalizedAddress)
    return
  }
  const displayName = getPlayerDisplayName(normalizedAddress)
  const progress = await playerProgressStore.load(normalizedAddress, displayName)
  loadedProfileAddresses.add(normalizedAddress)
  sendPlayerLoadoutState(normalizedAddress)
  logLobbyServerEvent(`ProfileLoaded ${displayName} (${normalizedAddress})`)
  void room.send('lobbyEvent', {
    type: 'profile_loaded',
    message: `${displayName} profile loaded (GOLD ${progress.profile.gold})`
  })
}

function sendArenaAutoTeleport(players: LobbyPlayer[]): void {
  if (!players.length) return
  const lobby = getLobbyStateMutable()
  lobby.arenaIntroEndTimeMs = getServerTime() + ARENA_WARNING_SECONDS * 1000
  logLobbyServerEvent(`ArenaAutoTeleport ${players.length}/${MATCH_MAX_PLAYERS}`)
  void room.send('matchAutoTeleport', {
    addresses: players.map((player) => player.address),
    positionX: ARENA_TELEPORT_POSITION.x,
    positionY: ARENA_TELEPORT_POSITION.y,
    positionZ: ARENA_TELEPORT_POSITION.z,
    lookAtX: ARENA_TELEPORT_LOOK_AT.x,
    lookAtY: ARENA_TELEPORT_LOOK_AT.y,
    lookAtZ: ARENA_TELEPORT_LOOK_AT.z
  })
}

function sendLobbyReturnTeleport(players: LobbyPlayer[]): void {
  if (!players.length) return
  logLobbyServerEvent(`LobbyReturnTeleport ${players.length}`)
  void room.send('lobbyReturnTeleport', {
    addresses: players.map((player) => player.address),
    positionX: LOBBY_RETURN_POSITION.x,
    positionY: LOBBY_RETURN_POSITION.y,
    positionZ: LOBBY_RETURN_POSITION.z,
    lookAtX: LOBBY_RETURN_LOOK_AT.x,
    lookAtY: LOBBY_RETURN_LOOK_AT.y,
    lookAtZ: LOBBY_RETURN_LOOK_AT.z
  })
}

function startArenaAutoTeleportCountdown(players: LobbyPlayer[]): void {
  const lobby = getLobbyStateMutable()
  if (lobby.countdownEndTimeMs > 0) return
  lobby.countdownEndTimeMs = getServerTime() + AUTO_TELEPORT_COUNTDOWN_SECONDS * 1000
  logLobbyServerEvent(
    `ArenaAutoTeleportCountdownStarted ${players.length}/${MATCH_MAX_PLAYERS} (${AUTO_TELEPORT_COUNTDOWN_SECONDS}s)`
  )
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
  if (mutable.phase === LobbyPhase.MATCH_CREATED && !isMatchJoinLocked()) {
    mutable.arenaPlayers = [...mutable.arenaPlayers, nextPlayers[nextPlayers.length - 1]]
    if (mutable.arenaPlayers.length === MATCH_MAX_PLAYERS) {
      startArenaAutoTeleportCountdown(mutable.arenaPlayers)
    }
  }

  logLobbyServerEvent(
    `PlayerJoined ${getPlayerDisplayName(normalizedAddress)} ${nextPlayers.length}/${MATCH_MAX_PLAYERS}`
  )

  void room.send('lobbyEvent', {
    type: 'join',
    message: `${getPlayerDisplayName(normalizedAddress)} joined lobby`
  })
}

async function removePlayerFromLobby(address: string): Promise<void> {
  const normalizedAddress = address.toLowerCase()
  const state = getLobbyState()
  const nextPlayers = state.players.filter((p) => p.address !== normalizedAddress)
  const nextArenaPlayers = state.arenaPlayers.filter((p) => p.address !== normalizedAddress)
  const leavingPlayer = state.players.find((p) => p.address === normalizedAddress)

  await playerProgressStore.saveAndEvict(normalizedAddress)
  loadedProfileAddresses.delete(normalizedAddress)
  removePlayerCombatState(normalizedAddress)
  clearPlayerShotRateLimitState(normalizedAddress)
  disconnectedLobbyPlayerSinceMs.delete(normalizedAddress)
  setPlayers(nextPlayers)
  setArenaPlayers(nextArenaPlayers)
  if (nextArenaPlayers.length === 0) {
    cancelArenaAutoTeleportCountdown()
  }
  if (nextArenaPlayers.length === 0) {
    cancelArenaIntroCountdown()
    if (state.phase === LobbyPhase.MATCH_CREATED) {
      resetArenaToLobby('Match closed. Returning to lobby.')
    }
  }

  if (leavingPlayer) {
    logLobbyServerEvent(
      `PlayerLeft ${leavingPlayer.displayName} ${nextPlayers.length}/${MATCH_MAX_PLAYERS}`
    )
    void room.send('lobbyEvent', {
      type: 'leave',
      message: `${leavingPlayer.displayName} left lobby`
    })
  }
}

function getConnectedPlayerAddresses(): Set<string> {
  const connectedAddresses = new Set<string>()
  for (const [_entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (!identity.address) continue
    connectedAddresses.add(identity.address.toLowerCase())
  }
  return connectedAddresses
}

async function reconcileDisconnectedLobbyPlayers(): Promise<void> {
  if (isDisconnectReconcileInFlight) return
  isDisconnectReconcileInFlight = true

  try {
    const lobbyState = getLobbyState()
    if (!lobbyState.players.length) {
      disconnectedLobbyPlayerSinceMs.clear()
      return
    }

    const now = getServerTime()
    const connectedAddresses = getConnectedPlayerAddresses()
    const staleAddresses: string[] = []

    for (const player of lobbyState.players) {
      const address = player.address.toLowerCase()
      if (connectedAddresses.has(address)) {
        disconnectedLobbyPlayerSinceMs.delete(address)
        continue
      }

      const missingSince = disconnectedLobbyPlayerSinceMs.get(address) ?? now
      disconnectedLobbyPlayerSinceMs.set(address, missingSince)
      if (now - missingSince >= DISCONNECTED_PLAYER_GRACE_MS) {
        staleAddresses.push(address)
      }
    }

    for (const trackedAddress of [...disconnectedLobbyPlayerSinceMs.keys()]) {
      if (connectedAddresses.has(trackedAddress)) {
        disconnectedLobbyPlayerSinceMs.delete(trackedAddress)
      }
    }

    for (const address of staleAddresses) {
      logLobbyServerEvent(`PlayerDisconnected ${address}`)
      await removePlayerFromLobby(address)
    }
  } finally {
    isDisconnectReconcileInFlight = false
  }
}

function disconnectedPlayerReconcileSystem(dt: number): void {
  disconnectedPlayerReconcileAccumulator += dt
  if (disconnectedPlayerReconcileAccumulator < DISCONNECTED_PLAYER_RECONCILE_INTERVAL_SECONDS) return
  disconnectedPlayerReconcileAccumulator = 0
  void reconcileDisconnectedLobbyPlayers()
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
  mutable.arenaPlayers = [...state.players]
  mutable.countdownEndTimeMs = 0
  mutable.arenaIntroEndTimeMs = 0
  resetMatchRuntime()
  logLobbyServerEvent(`MatchCreated ${mutable.matchId} by ${normalizedAddress}`)

  void room.send('lobbyEvent', {
    type: 'match_created',
    message: `Match created (${mutable.matchId})`
  })

  if (mutable.arenaPlayers.length === MATCH_MAX_PLAYERS) {
    startArenaAutoTeleportCountdown(mutable.arenaPlayers)
  }
}

function getSpawnGroupSize(waveNumber: number): number {
  const growth = Math.floor(Math.max(0, waveNumber - 1) / CLIENT_GROUP_GROWTH_EVERY_WAVES)
  return Math.min(CLIENT_MAX_GROUP_SIZE, CLIENT_BASE_GROUP_SIZE + growth)
}

function getExploderChanceForWave(waveNumber: number): number {
  if (waveNumber >= EXPLODER_ZOMBIE_CHANCE_WAVE_4) return EXPLODER_ZOMBIE_CHANCE_4
  if (waveNumber >= EXPLODER_ZOMBIE_CHANCE_WAVE_3) return EXPLODER_ZOMBIE_CHANCE_3
  if (waveNumber >= EXPLODER_ZOMBIE_CHANCE_WAVE_2) return EXPLODER_ZOMBIE_CHANCE_2
  return EXPLODER_ZOMBIE_BASE_CHANCE
}

function getExploderMaxSimultaneousForWave(waveNumber: number): number {
  return waveNumber >= EXPLODER_ZOMBIE_MAX_SIMULTANEOUS_LATE_WAVE
    ? EXPLODER_ZOMBIE_MAX_SIMULTANEOUS_LATE
    : EXPLODER_ZOMBIE_MAX_SIMULTANEOUS_EARLY
}

function pickZombieType(waveNumber: number): ZombieType {
  if (waveNumber === 1) return 'basic'
  const roll = Math.random()
  if (waveNumber >= TANK_ZOMBIE_UNLOCK_WAVE && roll < TANK_ZOMBIE_CHANCE) return 'tank'
  if (waveNumber >= QUICK_ZOMBIE_UNLOCK_WAVE && roll < QUICK_ZOMBIE_CHANCE) return 'quick'
  return 'basic'
}

function randomSpawnPoint() {
  const spawnX = ARENA_SPAWN_MIN_X + Math.random() * (ARENA_SPAWN_MAX_X - ARENA_SPAWN_MIN_X)
  const spawnZ = ARENA_SPAWN_MIN_Z + Math.random() * (ARENA_SPAWN_MAX_Z - ARENA_SPAWN_MIN_Z)
  return { spawnX, spawnY: 0, spawnZ }
}

function buildWaveSpawnPlan(waveNumber: number, startAtMs: number, activeDurationSeconds: number, playerCount: number) {
  const intervalMs = Math.floor(CLIENT_SPAWN_INTERVAL_SECONDS * 1000)
  const activeMs = Math.floor(activeDurationSeconds * 1000)
  const exploderCooldownMs = Math.floor(EXPLODER_ZOMBIE_COOLDOWN_SECONDS * 1000)
  // Scale group size with player count: +10% per additional player (1p=1x, 2p=1.1x, 3p=1.2x, 4p=1.3x)
  const playerMultiplier = 0.9 + Math.max(1, playerCount) * 0.1
  const groupSize = Math.round(getSpawnGroupSize(waveNumber) * playerMultiplier)
  const spawns: WavePlanSpawn[] = []
  let lastExploderSpawnAtMs = Number.NEGATIVE_INFINITY
  let guaranteedExploderSpawned = false

  for (let offsetMs = 0; offsetMs < activeMs; offsetMs += intervalMs) {
    const groupSpawnAtMs = startAtMs + offsetMs
    let groupHasExploder = false

    for (let i = 0; i < groupSize; i++) {
      nextZombieSequence += 1
      const point = randomSpawnPoint()
      const zombieId = `w${waveNumber}_z${nextZombieSequence}`
      let zombieType = pickZombieType(waveNumber)

      if (
        waveNumber >= EXPLODER_ZOMBIE_UNLOCK_WAVE &&
        !groupHasExploder &&
        groupSpawnAtMs - lastExploderSpawnAtMs >= exploderCooldownMs
      ) {
        const maxSimultaneousExploders = getExploderMaxSimultaneousForWave(waveNumber)
        const exploderPlanningWindowStartMs = groupSpawnAtMs - exploderCooldownMs * maxSimultaneousExploders
        const explodersAlreadyPlanned = spawns.filter(
          (spawn) =>
            spawn.zombieType === 'exploder' &&
            spawn.spawnAtMs >= exploderPlanningWindowStartMs &&
            spawn.spawnAtMs <= groupSpawnAtMs
        ).length
        const canSpawnExploder = explodersAlreadyPlanned < maxSimultaneousExploders
        const shouldForceTutorialExploder = waveNumber === EXPLODER_ZOMBIE_UNLOCK_WAVE && !guaranteedExploderSpawned
        const shouldRollExploder = Math.random() < getExploderChanceForWave(waveNumber)

        if (canSpawnExploder && (shouldForceTutorialExploder || shouldRollExploder)) {
          zombieType = 'exploder'
          groupHasExploder = true
          guaranteedExploderSpawned = true
          lastExploderSpawnAtMs = groupSpawnAtMs
        }
      }

      spawns.push({
        zombieId,
        zombieType,
        spawnX: point.spawnX,
        spawnY: point.spawnY,
        spawnZ: point.spawnZ,
        spawnAtMs: groupSpawnAtMs
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
  const playerCount = getLobbyState()?.arenaPlayers.length ?? 1
  const plan = buildWaveSpawnPlan(waveNumber, startAtMs, runtime.activeDurationSeconds, playerCount)

  for (const spawn of plan.spawns) {
    zombieSpawnAtById.set(spawn.zombieId, {
      zombieType: spawn.zombieType,
      hp: getZombieMaxHp(spawn.zombieType),
      spawnX: spawn.spawnX,
      spawnY: spawn.spawnY,
      spawnZ: spawn.spawnZ,
      spawnAtMs: spawn.spawnAtMs
    })
    deadZombieIds.delete(spawn.zombieId)
    explodedZombieIds.delete(spawn.zombieId)
  }

  recomputeZombiesAlive(runtime, runtime.serverNowMs)
  runtime.zombiesPlanned = plan.spawns.length

  void room.send('waveSpawnPlan', plan)
}

function grantWaveMilestoneGold(waveNumber: number, players: LobbyPlayer[]): void {
  const reachedMilestones = GOLD_WAVE_MILESTONES.filter((milestone) => milestone.wave <= waveNumber)
  for (const milestone of reachedMilestones) {
    if (awardedWaveGoldMilestones.has(milestone.wave)) continue
    awardedWaveGoldMilestones.add(milestone.wave)

    for (const player of players) {
      playerProgressStore.mutate(player.address, (progress) => {
        progress.profile.gold += milestone.gold
      })
      sendPlayerLoadoutState(player.address)
    }

    void room.send('lobbyEvent', {
      type: 'gold_reward',
      message: `Wave ${milestone.wave} reached: +${milestone.gold} GOLD`
    })
  }
}

function startZombieWaves(address: string, startReason: 'manual' | 'auto' = 'manual'): void {
  const normalizedAddress = address.toLowerCase()
  const state = getLobbyState()
  if (state.phase !== LobbyPhase.MATCH_CREATED) return
  if (!state.arenaPlayers.some((p) => p.address === normalizedAddress)) return

  const runtime = getMatchRuntimeMutable()
  if (runtime.isRunning) return

  const lobby = getLobbyStateMutable()
  lobby.arenaIntroEndTimeMs = 0

  runtime.isRunning = true
  runtime.waveNumber = 1
  runtime.cyclePhase = WaveCyclePhase.ACTIVE
  runtime.serverNowMs = getServerTime()
  runtime.phaseEndTimeMs = runtime.serverNowMs + runtime.activeDurationSeconds * 1000
  runtime.startedByAddress = normalizedAddress
  clearZombieTracking(runtime)
  sendWaveSpawnPlan(runtime.waveNumber, runtime.serverNowMs)
  queueLavaHazardsForWave(runtime.waveNumber, runtime.serverNowMs)
  spawnScheduledLavaHazards(runtime.serverNowMs)
  logLobbyServerEvent(`WavesStarted by ${normalizedAddress}`)

  for (const player of state.arenaPlayers) {
    resetPlayerCombatState(player.address)
  }
  sendPlayerHealthStatesForLobbyPlayers(state.arenaPlayers)
  for (const player of state.arenaPlayers) {
    sendPlayerArenaWeaponState(player.address)
  }

  for (const player of state.arenaPlayers) {
    playerProgressStore.mutate(player.address, (progress) => {
      progress.profile.lifetimeStats.matchesPlayed += 1
    })
  }

  void room.send('lobbyEvent', {
    type: 'waves_started',
    message: startReason === 'auto' ? 'Waves started' : `${getPlayerDisplayName(normalizedAddress)} started zombies`
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
  expirePotions(now)
  spawnScheduledLavaHazards(now)
  expireLavaHazards(now)
  recomputeZombiesAlive(runtime, now)

  if (pendingTeamWipeReturn && now >= pendingTeamWipeReturn.executeAtMs) {
    finalizePendingTeamWipeReturn()
    return
  }

  if (lobbyState.arenaPlayers.length === 0) {
    cancelArenaIntroCountdown()
    resetArenaToLobby('Match closed. Returning to lobby.')
    return
  }

  if (lobbyState.countdownEndTimeMs > 0 && now >= lobbyState.countdownEndTimeMs) {
    cancelArenaAutoTeleportCountdown()
    sendArenaAutoTeleport(lobbyState.arenaPlayers)
  }

  if (!runtime.isRunning && lobbyState.arenaIntroEndTimeMs > 0 && now >= lobbyState.arenaIntroEndTimeMs) {
    const starterAddress = lobbyState.arenaPlayers.some((player) => player.address === lobbyState.hostAddress)
      ? lobbyState.hostAddress
      : lobbyState.arenaPlayers[0]?.address
    if (starterAddress) {
      startZombieWaves(starterAddress, 'auto')
    }
  }

  for (const player of lobbyState.arenaPlayers) {
    const combat = getOrCreatePlayerCombatState(player.address)
    if (!combat.isDead) continue
    if (combat.respawnAtMs <= 0 || now < combat.respawnAtMs) continue
    combat.hp = PLAYER_MAX_HP
    combat.isDead = false
    combat.respawnAtMs = 0
    sendPlayerHealthState(player.address)
  }

  if (!runtime.isRunning) return
  if (now < runtime.phaseEndTimeMs) return

  if (runtime.cyclePhase === WaveCyclePhase.ACTIVE) {
    runtime.cyclePhase = WaveCyclePhase.REST
    runtime.phaseEndTimeMs = now + runtime.restDurationSeconds * 1000
    clearAllLavaHazards()
    grantWaveMilestoneGold(runtime.waveNumber, lobbyState.arenaPlayers)
    for (const player of lobbyState.arenaPlayers) {
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
    queueLavaHazardsForWave(runtime.waveNumber, now)
    spawnScheduledLavaHazards(now)
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
    sendPlayerHealthState(context.from)
    sendArenaWeaponStatesTo(context.from)
    sendPowerupStatesTo(context.from)
    if (isPlayerInArena(context.from)) {
      sendActivePotionsTo(context.from)
      sendActiveLavaHazardsTo(context.from)
    }
  })

  room.onMessage('playerLeaveLobby', async (_data, context) => {
    if (!context) return
    await removePlayerFromLobby(context.from)
  })

  room.onMessage('buyLoadoutWeapon', async (data, context) => {
    if (!context) return
    const normalizedAddress = context.from.toLowerCase()
    await ensurePlayerProfileLoaded(normalizedAddress)

    const weapon = getLoadoutWeaponDefinition(data.weaponId)
    if (!weapon || weapon.priceGold === 0) return

    const progress = playerProgressStore.get(normalizedAddress)
    if (!progress) return

    const alreadyOwned = progress.weapons.ownedByTier[weapon.tierKey].includes(weapon.id)
    if (alreadyOwned) {
      sendPlayerLoadoutState(normalizedAddress)
      return
    }
    if (progress.profile.gold < weapon.priceGold) {
      void room.send('lobbyEvent', {
        type: 'loadout_error',
        message: `Not enough GOLD for ${weapon.label}`
      })
      return
    }

    playerProgressStore.mutate(normalizedAddress, (state) => {
      state.profile.gold -= weapon.priceGold
      state.weapons.ownedByTier[weapon.tierKey] = [...state.weapons.ownedByTier[weapon.tierKey], weapon.id]
      state.weapons.equippedByTier[weapon.tierKey] = weapon.id
    })
    await playerProgressStore.save(normalizedAddress)
    sendPlayerLoadoutState(normalizedAddress)

    void room.send('lobbyEvent', {
      type: 'loadout_purchase',
      message: `${weapon.label} purchased and equipped for ${weapon.priceGold} GOLD`
    })
  })

  room.onMessage('equipLoadoutWeapon', async (data, context) => {
    if (!context) return
    const normalizedAddress = context.from.toLowerCase()
    await ensurePlayerProfileLoaded(normalizedAddress)

    const weapon = getLoadoutWeaponDefinition(data.weaponId)
    if (!weapon) return

    const progress = playerProgressStore.get(normalizedAddress)
    if (!progress) return

    const ownedWeaponIds =
      weapon.priceGold === 0
        ? [weapon.id]
        : progress.weapons.ownedByTier[weapon.tierKey]
    if (!ownedWeaponIds.includes(weapon.id)) {
      void room.send('lobbyEvent', {
        type: 'loadout_error',
        message: `${weapon.label} is not owned yet`
      })
      return
    }

    playerProgressStore.mutate(normalizedAddress, (state) => {
      state.weapons.equippedByTier[weapon.tierKey] = weapon.id
    })
    await playerProgressStore.save(normalizedAddress)
    sendPlayerLoadoutState(normalizedAddress)

    void room.send('lobbyEvent', {
      type: 'loadout_equipped',
      message: `${weapon.label} equipped`
    })
  })

  room.onMessage('createMatch', (_data, context) => {
    if (!context) return
    if (!isPlayerInLobby(context.from)) return
    const state = getLobbyState()
    if (state.phase === LobbyPhase.MATCH_CREATED) return
    createMatch(context.from)
  })

  room.onMessage('startGameManual', (_data, context) => {
    if (!context) return
    if (!isPlayerInLobby(context.from)) return
    const state = getLobbyState()
    if (state.phase !== LobbyPhase.MATCH_CREATED) {
      createMatch(context.from)
    }
    const updatedState = getLobbyState()
    if (updatedState.phase === LobbyPhase.MATCH_CREATED && updatedState.arenaPlayers.length > 0) {
      startArenaAutoTeleportCountdown(updatedState.arenaPlayers)
    }
  })

  room.onMessage('createMatchAndJoin', async (_data, context) => {
    if (!context) return
    if (!isPlayerInLobby(context.from) && isMatchJoinLocked()) {
      logLobbyServerEvent(`JoinRejectedMatchLocked ${context.from.toLowerCase()}`)
      await ensurePlayerProfileLoaded(context.from)
      addPlayerToLobby(context.from)
      void room.send('lobbyEvent', {
        type: 'match_locked',
        message: `${getPlayerDisplayName(context.from.toLowerCase())} can join the next match`
      })
      return
    }
    await ensurePlayerLoadedAndInLobby(context.from)
    const state = getLobbyState()
    if (state.phase !== LobbyPhase.MATCH_CREATED) {
      createMatch(context.from)
    }
    sendPlayerHealthState(context.from)
    sendArenaWeaponStatesTo(context.from)
    sendPowerupStatesTo(context.from)
    if (isPlayerInArena(context.from)) {
      sendActivePotionsTo(context.from)
      sendActiveLavaHazardsTo(context.from)
    }
  })

  room.onMessage('playerArenaWeaponChanged', (data, context) => {
    if (!context) return
    const normalizedAddress = context.from.toLowerCase()
    if (!isPlayerInArena(normalizedAddress)) return
    if (!isArenaWeaponType(data.weaponType)) return

    const upgradeLevel =
      Number.isInteger(data.upgradeLevel) && data.upgradeLevel >= 1 && data.upgradeLevel <= 3
        ? data.upgradeLevel
        : 1
    arenaWeaponByAddress.set(normalizedAddress, { weaponType: data.weaponType, upgradeLevel })
    sendPlayerArenaWeaponState(normalizedAddress)
  })

  room.onMessage('zombieHitRequest', (data, context) => {
    if (!context) return
    const normalizedAddress = context.from.toLowerCase()
    if (!isPlayerInArena(context.from)) return
    const lobbyState = getLobbyState()
    if (lobbyState.phase !== LobbyPhase.MATCH_CREATED) return
    const runtime = getMatchRuntimeMutable()
    if (!runtime.isRunning) return
    if (!data.zombieId) return
    if (!isArenaWeaponType(data.weaponType)) return

    const shotSeq = Number.isFinite(data.shotSeq) ? Math.floor(data.shotSeq) : -1
    if (shotSeq < 0) return

    const allowanceKey = getShotAllowanceKey(normalizedAddress, data.weaponType, shotSeq)
    const remainingHits = zombieHitAllowanceByShotKey.get(allowanceKey) ?? 0
    if (remainingHits <= 0) return
    const now = getServerTime()

    const damage = getWeaponHitDamage(normalizedAddress, data.weaponType as ArenaWeaponType)
    zombieHitAllowanceByShotKey.set(allowanceKey, remainingHits - 1)
    applyZombieDamage(data.zombieId, damage, normalizedAddress, now)
  })

  room.onMessage('zombieExplodeRequest', (data, context) => {
    if (!context) return
    const normalizedAddress = context.from.toLowerCase()
    if (!isPlayerInArena(normalizedAddress)) return

    const lobbyState = getLobbyState()
    if (lobbyState.phase !== LobbyPhase.MATCH_CREATED) return

    const runtime = getMatchRuntimeMutable()
    if (!runtime.isRunning) return
    if (!data.zombieId) return

    explodeZombie(data.zombieId, getServerTime())
  })

  room.onMessage('potionClaimRequest', (data, context) => {
    if (!context) return
    const normalizedAddress = context.from.toLowerCase()
    if (!isPlayerInArena(normalizedAddress)) return
    if (!data.potionId) return

    const potion = activePotionsById.get(data.potionId)
    if (!potion) {
      void room.send('potionClaimRejected', { potionId: data.potionId }, { to: [normalizedAddress] })
      return
    }

    const now = getServerTime()
    if (potion.expiresAtMs <= now) {
      activePotionsById.delete(data.potionId)
      void room.send('potionExpired', { potionId: data.potionId })
      return
    }

    const playerPosition = getPlayerPosition(normalizedAddress)
    if (
      playerPosition &&
      distanceXZ(playerPosition.x, playerPosition.z, potion.positionX, potion.positionZ) > POTION_PICKUP_RADIUS
    ) {
      void room.send('potionClaimRejected', { potionId: data.potionId }, { to: [normalizedAddress] })
      return
    }

    activePotionsById.delete(data.potionId)
    const state = getOrCreatePlayerCombatState(normalizedAddress)
    if (potion.potionType === 'rage') {
      state.rageShieldEndAtMs = now + RAGE_SHIELD_DURATION_MS
    } else if (potion.potionType === 'speed') {
      state.speedEndAtMs = now + SPEED_POTION_DURATION_MS
    }
    sendPlayerPowerupState(normalizedAddress)
    void room.send('potionClaimed', {
      potionId: data.potionId,
      claimerAddress: normalizedAddress
    })
  })

  room.onMessage('rageShieldHitRequest', (data, context) => {
    if (!context) return
    const normalizedAddress = context.from.toLowerCase()
    if (!isPlayerInArena(normalizedAddress)) return
    if (!data.zombieId) return

    const lobbyState = getLobbyState()
    if (lobbyState.phase !== LobbyPhase.MATCH_CREATED) return

    const runtime = getMatchRuntimeMutable()
    if (!runtime.isRunning) return

    const now = getServerTime()
    const state = getOrCreatePlayerCombatState(normalizedAddress)
    if (state.isDead) return
    if (!isRageShieldActive(state, now)) return

    const zombie = zombieSpawnAtById.get(data.zombieId)
    if (!zombie || zombie.spawnAtMs > now) return

    const hitKey = getRageShieldHitKey(normalizedAddress, data.zombieId)
    const lastHitAtMs = lastRageShieldHitAtMsByPlayerAndZombie.get(hitKey) ?? 0
    if (now - lastHitAtMs < RAGE_SHIELD_HIT_COOLDOWN_MS) return

    // The server only tracks the zombie spawn point, not its live world position.
    // Range gating is already performed client-side against the current zombie transform.
    lastRageShieldHitAtMsByPlayerAndZombie.set(hitKey, now)
    applyZombieDamage(data.zombieId, RAGE_SHIELD_DAMAGE, normalizedAddress, now)
  })

  room.onMessage('playerDamageRequest', (data, context) => {
    if (!context) return
    const normalizedAddress = context.from.toLowerCase()
    if (!isPlayerInArena(normalizedAddress)) return

    const lobbyState = getLobbyState()
    if (lobbyState.phase !== LobbyPhase.MATCH_CREATED) return

    const runtime = getMatchRuntimeMutable()
    if (!runtime.isRunning) return

    const now = getServerTime()
    const state = getOrCreatePlayerCombatState(normalizedAddress)
    if (state.isDead) return
    if (isRageShieldActive(state, now)) return
    if (now - state.lastDamageRequestAtMs < PLAYER_DAMAGE_REQUEST_COOLDOWN_MS) return

    const requestedAmount = Number.isFinite(data.amount) ? Math.floor(data.amount) : 1
    const amount = Math.max(1, Math.min(3, requestedAmount))
    state.lastDamageRequestAtMs = now
    state.hp = Math.max(0, state.hp - amount)
    if (state.hp <= 0) {
      state.isDead = true
      state.respawnAtMs = now + PLAYER_RESPAWN_SECONDS * 1000
    }
    sendPlayerHealthState(normalizedAddress)

    if (areAllLobbyPlayersDead(lobbyState.arenaPlayers)) {
      endMatchAndReturnToLobby('All players died. Returning to lobby.')
    }
  })

  room.onMessage('lavaHazardDamageRequest', (data, context) => {
    if (!context) return
    const normalizedAddress = context.from.toLowerCase()
    if (!isPlayerInArena(normalizedAddress)) return
    if (!data.lavaId) return

    const lobbyState = getLobbyState()
    if (lobbyState.phase !== LobbyPhase.MATCH_CREATED) return

    const runtime = getMatchRuntimeMutable()
    if (!runtime.isRunning) return

    const now = getServerTime()
    const lava = activeLavaHazardsById.get(data.lavaId)
    if (!lava) return
    if (now < lava.activeAtMs || now >= lava.expiresAtMs) return

    const state = getOrCreatePlayerCombatState(normalizedAddress)
    if (state.isDead) return
    if (isRageShieldActive(state, now)) return
    if (now - state.lastLavaDamageAtMs < LAVA_DAMAGE_INTERVAL_MS) return

    state.lastLavaDamageAtMs = now
    state.hp = Math.max(0, state.hp - 1)
    if (state.hp <= 0) {
      state.isDead = true
      state.respawnAtMs = now + PLAYER_RESPAWN_SECONDS * 1000
    }
    sendPlayerHealthState(normalizedAddress)

    if (areAllLobbyPlayersDead(lobbyState.arenaPlayers)) {
      endMatchAndReturnToLobby('All players died. Returning to lobby.')
    }
  })

  room.onMessage('playerExplosionDamageRequest', (data, context) => {
    if (!context) return
    const normalizedAddress = context.from.toLowerCase()
    if (!isPlayerInArena(normalizedAddress)) return
    if (!data.zombieId) return

    const lobbyState = getLobbyState()
    if (lobbyState.phase !== LobbyPhase.MATCH_CREATED) return

    const runtime = getMatchRuntimeMutable()
    if (!runtime.isRunning) return

    const now = getServerTime()
    applyExplosionDamageToPlayer(normalizedAddress, data.zombieId, data.amount, now)

    if (areAllLobbyPlayersDead(lobbyState.arenaPlayers)) {
      endMatchAndReturnToLobby('All players died. Returning to lobby.')
    }
  })

  room.onMessage('playerHealRequest', (data, context) => {
    if (!context) return
    const normalizedAddress = context.from.toLowerCase()
    if (!isPlayerInArena(normalizedAddress)) return

    const lobbyState = getLobbyState()
    if (lobbyState.phase !== LobbyPhase.MATCH_CREATED) return

    const runtime = getMatchRuntimeMutable()
    if (!runtime.isRunning) return

    const state = getOrCreatePlayerCombatState(normalizedAddress)
    if (state.isDead) return

    const now = getServerTime()
    if (now - state.lastHealRequestAtMs < PLAYER_HEAL_REQUEST_COOLDOWN_MS) return

    const requestedAmount = Number.isFinite(data.amount) ? Math.floor(data.amount) : HEALTH_POTION_HEAL_AMOUNT
    const amount = Math.max(1, Math.min(HEALTH_POTION_HEAL_AMOUNT, requestedAmount))
    state.lastHealRequestAtMs = now
    state.hp = Math.min(PLAYER_MAX_HP, state.hp + amount)
    sendPlayerHealthState(normalizedAddress)
  })

  room.onMessage('playerShotRequest', (data, context) => {
    if (!context) return
    const normalizedAddress = context.from.toLowerCase()
    if (!isPlayerInArena(normalizedAddress)) return

    const lobbyState = getLobbyState()
    if (lobbyState.phase !== LobbyPhase.MATCH_CREATED) return

    const runtime = getMatchRuntimeMutable()
    if (!runtime.isRunning) return

    const state = getOrCreatePlayerCombatState(normalizedAddress)
    if (state.isDead) return

    if (!isArenaWeaponType(data.weaponType)) return
    const weaponType = data.weaponType
    const now = getServerTime()
    const rateLimitKey = `${normalizedAddress}:${weaponType}`
    const lastShotAtMs = lastShotAtMsByPlayerAndWeapon.get(rateLimitKey) ?? 0
    const effectiveShotRateLimitMs = SHOT_RATE_LIMIT_MS_BY_WEAPON[weaponType] / getPlayerFireRateMultiplier(state, now)
    if (now - lastShotAtMs < effectiveShotRateLimitMs) return

    const originX = Number(data.originX)
    const originY = Number(data.originY)
    const originZ = Number(data.originZ)
    const directionX = Number(data.directionX)
    const directionY = Number(data.directionY)
    const directionZ = Number(data.directionZ)
    if (
      !Number.isFinite(originX) ||
      !Number.isFinite(originY) ||
      !Number.isFinite(originZ) ||
      !Number.isFinite(directionX) ||
      !Number.isFinite(directionY) ||
      !Number.isFinite(directionZ)
    ) {
      return
    }

    const directionLenSq = directionX * directionX + directionY * directionY + directionZ * directionZ
    if (directionLenSq < 0.0001) return
    const directionLen = Math.sqrt(directionLenSq)

    lastShotAtMsByPlayerAndWeapon.set(rateLimitKey, now)
    const shotSeq = Number.isFinite(data.seq) ? Math.floor(data.seq) : 0
    zombieHitAllowanceByShotKey.set(
      getShotAllowanceKey(normalizedAddress, weaponType, shotSeq),
      ZOMBIE_HITS_ALLOWED_PER_SHOT[weaponType]
    )
    void room.send('playerShotBroadcast', {
      shooterAddress: normalizedAddress,
      seq: shotSeq,
      weaponType,
      originX,
      originY,
      originZ,
      directionX: directionX / directionLen,
      directionY: directionY / directionLen,
      directionZ: directionZ / directionLen,
      firedAtMs: Number.isFinite(data.firedAtMs) ? Math.floor(data.firedAtMs) : now,
      serverTimeMs: now
    })
  })

  engine.addSystem(waveRuntimeSystem, undefined, 'match-wave-runtime-system')
  engine.addSystem(playerProgressAutosaveSystem, undefined, 'player-progress-autosave-system')
  engine.addSystem(disconnectedPlayerReconcileSystem, undefined, 'disconnected-player-reconcile-system')

  console.log('[Server] Lobby server ready')
}
