import { Storage } from '@dcl/sdk/server'
import { DEFAULT_LOADOUT_WEAPON_BY_TIER } from '../../shared/loadoutCatalog'

const PROFILE_KEY = 'profile_v1'
const WEAPONS_KEY = 'weapons_v1'
const ITEMS_KEY = 'items_v1'

const SCHEMA_VERSION = 1

export type TierKey = 'tier1' | 'tier2' | 'tier3' | 'tier4'

export type PlayerProfileV1 = {
  schemaVersion: number
  lastKnownName: string
  gold: number
  lifetimeStats: {
    matchesPlayed: number
    wavesCleared: number
    zombiesKilled: number
  }
  updatedAt: number
}

export type PlayerWeaponsV1 = {
  schemaVersion: number
  ownedByTier: Record<TierKey, string[]>
  equippedByTier: Record<TierKey, string>
  updatedAt: number
}

export type PlayerItemsV1 = {
  schemaVersion: number
  ownedItemIds: string[]
  equippedItemIds: string[]
  updatedAt: number
}

export type PlayerProgressV1 = {
  profile: PlayerProfileV1
  weapons: PlayerWeaponsV1
  items: PlayerItemsV1
}

function nowMs(): number {
  return Date.now()
}

function emptyWeapons(): PlayerWeaponsV1 {
  return {
    schemaVersion: SCHEMA_VERSION,
    ownedByTier: {
      tier1: ['gun_t1'],
      tier2: ['shotgun_t1'],
      tier3: ['minigun_t1'],
      tier4: []
    },
    equippedByTier: {
      tier1: 'gun_t1',
      tier2: 'shotgun_t1',
      tier3: 'minigun_t1',
      tier4: ''
    },
    updatedAt: nowMs()
  }
}

function emptyItems(): PlayerItemsV1 {
  return {
    schemaVersion: SCHEMA_VERSION,
    ownedItemIds: [],
    equippedItemIds: [],
    updatedAt: nowMs()
  }
}

function emptyProfile(displayName: string): PlayerProfileV1 {
  return {
    schemaVersion: SCHEMA_VERSION,
    lastKnownName: displayName,
    gold: 0,
    lifetimeStats: {
      matchesPlayed: 0,
      wavesCleared: 0,
      zombiesKilled: 0
    },
    updatedAt: nowMs()
  }
}

function normalizeProfile(value: unknown, displayName: string): PlayerProfileV1 {
  const maybe = value as Partial<PlayerProfileV1> | null
  if (!maybe || maybe.schemaVersion !== SCHEMA_VERSION) return emptyProfile(displayName)

  return {
    schemaVersion: SCHEMA_VERSION,
    lastKnownName: typeof maybe.lastKnownName === 'string' ? maybe.lastKnownName : displayName,
    gold: typeof maybe.gold === 'number' && Number.isFinite(maybe.gold) ? maybe.gold : 0,
    lifetimeStats: {
      matchesPlayed:
        typeof maybe.lifetimeStats?.matchesPlayed === 'number' && Number.isFinite(maybe.lifetimeStats.matchesPlayed)
          ? maybe.lifetimeStats.matchesPlayed
          : 0,
      wavesCleared:
        typeof maybe.lifetimeStats?.wavesCleared === 'number' && Number.isFinite(maybe.lifetimeStats.wavesCleared)
          ? maybe.lifetimeStats.wavesCleared
          : 0,
      zombiesKilled:
        typeof maybe.lifetimeStats?.zombiesKilled === 'number' && Number.isFinite(maybe.lifetimeStats.zombiesKilled)
          ? maybe.lifetimeStats.zombiesKilled
          : 0
    },
    updatedAt: typeof maybe.updatedAt === 'number' && Number.isFinite(maybe.updatedAt) ? maybe.updatedAt : nowMs()
  }
}

function normalizeWeapons(value: unknown): PlayerWeaponsV1 {
  const fallback = emptyWeapons()
  const maybe = value as Partial<PlayerWeaponsV1> | null
  if (!maybe || maybe.schemaVersion !== SCHEMA_VERSION) return fallback

  const safeArray = (arr: unknown): string[] => (Array.isArray(arr) ? arr.filter((v) => typeof v === 'string') : [])
  const ownedByTier = {
    tier1: safeArray(maybe.ownedByTier?.tier1),
    tier2: safeArray(maybe.ownedByTier?.tier2),
    tier3: safeArray(maybe.ownedByTier?.tier3),
    tier4: safeArray(maybe.ownedByTier?.tier4)
  }

  for (const [tierKey, weaponId] of Object.entries(DEFAULT_LOADOUT_WEAPON_BY_TIER) as Array<[TierKey, string]>) {
    if (!ownedByTier[tierKey].includes(weaponId)) {
      ownedByTier[tierKey].unshift(weaponId)
    }
  }

  const equippedByTier = {
    tier1: typeof maybe.equippedByTier?.tier1 === 'string' && maybe.equippedByTier.tier1 ? maybe.equippedByTier.tier1 : 'gun_t1',
    tier2:
      typeof maybe.equippedByTier?.tier2 === 'string' && maybe.equippedByTier.tier2
        ? maybe.equippedByTier.tier2
        : 'shotgun_t1',
    tier3:
      typeof maybe.equippedByTier?.tier3 === 'string' && maybe.equippedByTier.tier3
        ? maybe.equippedByTier.tier3
        : 'minigun_t1',
    tier4: typeof maybe.equippedByTier?.tier4 === 'string' ? maybe.equippedByTier.tier4 : ''
  }

  for (const [tierKey, weaponId] of Object.entries(DEFAULT_LOADOUT_WEAPON_BY_TIER) as Array<[TierKey, string]>) {
    if (!ownedByTier[tierKey].includes(equippedByTier[tierKey])) {
      equippedByTier[tierKey] = weaponId
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    ownedByTier,
    equippedByTier,
    updatedAt: typeof maybe.updatedAt === 'number' && Number.isFinite(maybe.updatedAt) ? maybe.updatedAt : nowMs()
  }
}

function normalizeItems(value: unknown): PlayerItemsV1 {
  const fallback = emptyItems()
  const maybe = value as Partial<PlayerItemsV1> | null
  if (!maybe || maybe.schemaVersion !== SCHEMA_VERSION) return fallback

  const safeArray = (arr: unknown): string[] => (Array.isArray(arr) ? arr.filter((v) => typeof v === 'string') : [])

  return {
    schemaVersion: SCHEMA_VERSION,
    ownedItemIds: safeArray(maybe.ownedItemIds),
    equippedItemIds: safeArray(maybe.equippedItemIds),
    updatedAt: typeof maybe.updatedAt === 'number' && Number.isFinite(maybe.updatedAt) ? maybe.updatedAt : nowMs()
  }
}

export class PlayerProgressStore {
  private cache = new Map<string, PlayerProgressV1>()
  private dirty = new Set<string>()

  async load(address: string, displayName: string): Promise<PlayerProgressV1> {
    const key = address.toLowerCase()
    const cached = this.cache.get(key)
    if (cached) {
      if (cached.profile.lastKnownName !== displayName) {
        cached.profile.lastKnownName = displayName
        cached.profile.updatedAt = nowMs()
        this.dirty.add(key)
      }
      return cached
    }

    const [profileRaw, weaponsRaw, itemsRaw] = await Promise.all([
      Storage.player.get<unknown>(key, PROFILE_KEY),
      Storage.player.get<unknown>(key, WEAPONS_KEY),
      Storage.player.get<unknown>(key, ITEMS_KEY)
    ])

    const profile = normalizeProfile(profileRaw, displayName)
    const weapons = normalizeWeapons(weaponsRaw)
    const items = normalizeItems(itemsRaw)

    const loaded: PlayerProgressV1 = { profile, weapons, items }
    this.cache.set(key, loaded)

    // Ensure first save writes canonical format and latest display name
    this.dirty.add(key)
    return loaded
  }

  get(address: string): PlayerProgressV1 | null {
    return this.cache.get(address.toLowerCase()) ?? null
  }

  mutate(address: string, mutator: (value: PlayerProgressV1) => void): void {
    const key = address.toLowerCase()
    const state = this.cache.get(key)
    if (!state) return
    mutator(state)
    state.profile.updatedAt = nowMs()
    state.weapons.updatedAt = nowMs()
    state.items.updatedAt = nowMs()
    this.dirty.add(key)
  }

  markDirty(address: string): void {
    this.dirty.add(address.toLowerCase())
  }

  async save(address: string): Promise<void> {
    const key = address.toLowerCase()
    const state = this.cache.get(key)
    if (!state) return

    await Promise.all([
      Storage.player.set(key, PROFILE_KEY, state.profile),
      Storage.player.set(key, WEAPONS_KEY, state.weapons),
      Storage.player.set(key, ITEMS_KEY, state.items)
    ])

    this.dirty.delete(key)
  }

  async saveDirty(): Promise<void> {
    const dirtyAddresses = [...this.dirty]
    if (!dirtyAddresses.length) return

    await Promise.all(
      dirtyAddresses.map(async (address) => {
        await this.save(address)
      })
    )
  }

  async saveAndEvict(address: string): Promise<void> {
    const key = address.toLowerCase()
    await this.save(key)
    this.cache.delete(key)
    this.dirty.delete(key)
  }
}

export function createPlayerProgressStore(): PlayerProgressStore {
  return new PlayerProgressStore()
}
