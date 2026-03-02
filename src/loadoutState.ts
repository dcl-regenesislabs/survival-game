import { LoadoutWeaponId, LOADOUT_WEAPON_DEFINITIONS, getLoadoutWeaponDefinition } from './shared/loadoutCatalog'

export type PlayerLoadoutSnapshot = {
  gold: number
  ownedWeaponIds: LoadoutWeaponId[]
  equippedWeaponIds: LoadoutWeaponId[]
}

const defaultSnapshot: PlayerLoadoutSnapshot = {
  gold: 0,
  ownedWeaponIds: ['gun_basic'],
  equippedWeaponIds: ['gun_basic']
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

export function applyPlayerLoadoutSnapshot(snapshot: {
  gold: number
  ownedWeaponIds: string[]
  equippedWeaponIds: string[]
}): void {
  const ownedWeaponIds = uniqueWeaponIds(snapshot.ownedWeaponIds)
  if (!ownedWeaponIds.includes('gun_basic')) ownedWeaponIds.unshift('gun_basic')

  const equippedWeaponIds = uniqueWeaponIds(snapshot.equippedWeaponIds).filter((weaponId) =>
    ownedWeaponIds.includes(weaponId)
  )
  if (!equippedWeaponIds.includes('gun_basic')) equippedWeaponIds.unshift('gun_basic')

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
