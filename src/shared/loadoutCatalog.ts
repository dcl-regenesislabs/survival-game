export type ArenaWeaponType = 'gun' | 'shotgun' | 'minigun'
export type LoadoutWeaponId = 'gun_basic' | 'shotgun_pump' | 'minigun_heavy'
export type LoadoutTierKey = 'tier1' | 'tier2' | 'tier4'

export type LoadoutWeaponDefinition = {
  id: LoadoutWeaponId
  label: string
  arenaWeaponType: ArenaWeaponType
  tierKey: LoadoutTierKey
  priceGold: number
  previewLabel: string
}

export const LOADOUT_WEAPON_DEFINITIONS: LoadoutWeaponDefinition[] = [
  {
    id: 'gun_basic',
    label: 'Gun',
    arenaWeaponType: 'gun',
    tierKey: 'tier1',
    priceGold: 0,
    previewLabel: 'Starter sidearm'
  },
  {
    id: 'shotgun_pump',
    label: 'Shotgun',
    arenaWeaponType: 'shotgun',
    tierKey: 'tier2',
    priceGold: 2,
    previewLabel: 'Close-range spread'
  },
  {
    id: 'minigun_heavy',
    label: 'Minigun',
    arenaWeaponType: 'minigun',
    tierKey: 'tier4',
    priceGold: 5,
    previewLabel: 'Heavy sustained fire'
  }
]

export function getLoadoutWeaponDefinition(
  weaponId: string
): LoadoutWeaponDefinition | null {
  return LOADOUT_WEAPON_DEFINITIONS.find((weapon) => weapon.id === weaponId) ?? null
}
