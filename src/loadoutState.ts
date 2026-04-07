import {
  DEFAULT_LOADOUT_WEAPON_BY_TIER,
  LoadoutTierKey,
  LoadoutWeaponId,
  LOADOUT_WEAPON_DEFINITIONS,
  getLoadoutWeaponDefinition
} from './shared/loadoutCatalog'

export type PlayerLoadoutSnapshot = {
  gold: number
  ownedWeaponIds: LoadoutWeaponId[]
  equippedWeaponIds: LoadoutWeaponId[]
}

const defaultSnapshot: PlayerLoadoutSnapshot = {
  gold: 0,
  ownedWeaponIds: ['gun_t1', 'shotgun_t1', 'minigun_t1'],
  equippedWeaponIds: ['gun_t1', 'shotgun_t1', 'minigun_t1']
}

let playerLoadoutSnapshot: PlayerLoadoutSnapshot = { ...defaultSnapshot }

function uniqueWeaponIds(weaponIds: string[]): LoadoutWeaponId[] {
  const seen = new Set<LoadoutWeaponId>()
  const filtered: LoadoutWeaponId[] = []
  for (const weaponId of weaponIds) {
    const weapon = getLoadoutWeaponDefinition(weaponId)
    if (!weapon) continue
    if (seen.has(weapon.id)) continue
    seen.add(weapon.id)
    filtered.push(weapon.id)
  }
  return filtered
}

function normalizeEquippedWeaponIds(weaponIds: string[], ownedWeaponIds: LoadoutWeaponId[]): LoadoutWeaponId[] {
  const equippedByTier: Partial<Record<LoadoutTierKey, LoadoutWeaponId>> = {}

  for (const weaponId of uniqueWeaponIds(weaponIds)) {
    const weapon = getLoadoutWeaponDefinition(weaponId)
    if (!weapon || !ownedWeaponIds.includes(weapon.id)) continue
    equippedByTier[weapon.tierKey] = weapon.id
  }

  for (const [tierKey, weaponId] of Object.entries(DEFAULT_LOADOUT_WEAPON_BY_TIER) as Array<[LoadoutTierKey, LoadoutWeaponId]>) {
    if (!equippedByTier[tierKey] || !ownedWeaponIds.includes(equippedByTier[tierKey]!)) {
      equippedByTier[tierKey] = weaponId
    }
  }

  const orderedTierKeys: LoadoutTierKey[] = ['tier1', 'tier2', 'tier3', 'tier4']
  return orderedTierKeys.flatMap((tierKey) => (equippedByTier[tierKey] ? [equippedByTier[tierKey]!] : []))
}

export function applyPlayerLoadoutSnapshot(snapshot: {
  gold: number
  ownedWeaponIds: string[]
  equippedWeaponIds: string[]
}): void {
  const ownedWeaponIds = uniqueWeaponIds(snapshot.ownedWeaponIds)
  for (const weaponId of Object.values(DEFAULT_LOADOUT_WEAPON_BY_TIER)) {
    if (weaponId && !ownedWeaponIds.includes(weaponId)) ownedWeaponIds.push(weaponId)
  }

  const equippedWeaponIds = normalizeEquippedWeaponIds(snapshot.equippedWeaponIds, ownedWeaponIds)

  playerLoadoutSnapshot = {
    gold: Number.isFinite(snapshot.gold) ? Math.max(0, Math.floor(snapshot.gold)) : 0,
    ownedWeaponIds,
    equippedWeaponIds
  }
}

export function getPlayerLoadoutSnapshot(): PlayerLoadoutSnapshot {
  return {
    gold: playerLoadoutSnapshot.gold,
    ownedWeaponIds: [...playerLoadoutSnapshot.ownedWeaponIds],
    equippedWeaponIds: [...playerLoadoutSnapshot.equippedWeaponIds]
  }
}

export function getPlayerGold(): number {
  return playerLoadoutSnapshot.gold
}

export function isLoadoutWeaponOwned(weaponId: LoadoutWeaponId): boolean {
  return playerLoadoutSnapshot.ownedWeaponIds.includes(weaponId)
}

export function isLoadoutWeaponEquipped(weaponId: LoadoutWeaponId): boolean {
  return playerLoadoutSnapshot.equippedWeaponIds.includes(weaponId)
}

export function getDefaultSelectedLoadoutWeaponId(): LoadoutWeaponId {
  return LOADOUT_WEAPON_DEFINITIONS[0].id
}
