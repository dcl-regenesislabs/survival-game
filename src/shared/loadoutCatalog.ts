export type ArenaWeaponType = 'gun' | 'shotgun' | 'minigun'

export type LoadoutWeaponId =
  | 'gun_t1' | 'gun_t2' | 'gun_t3'
  | 'shotgun_t1' | 'shotgun_t2' | 'shotgun_t3'
  | 'minigun_t1' | 'minigun_t2' | 'minigun_t3'

export type LoadoutTierKey = 'tier1' | 'tier2' | 'tier3' | 'tier4'

export type LoadoutWeaponDefinition = {
  id: LoadoutWeaponId
  label: string
  arenaWeaponType: ArenaWeaponType
  tierKey: LoadoutTierKey
  upgradeLevel: 1 | 2 | 3
  priceGold: number
  previewLabel: string
}

export const DEFAULT_LOADOUT_WEAPON_BY_TIER: Partial<Record<LoadoutTierKey, LoadoutWeaponId>> = {
  tier1: 'gun_t1',
  tier2: 'shotgun_t1',
  tier3: 'minigun_t1'
}

export const LOADOUT_WEAPON_DEFINITIONS: LoadoutWeaponDefinition[] = [
  {
    id: 'gun_t1',
    label: 'Pistol',
    arenaWeaponType: 'gun',
    tierKey: 'tier1',
    upgradeLevel: 1,
    priceGold: 0,
    previewLabel: 'Starter sidearm'
  },
  {
    id: 'gun_t2',
    label: 'Pistol Mk.II',
    arenaWeaponType: 'gun',
    tierKey: 'tier1',
    upgradeLevel: 2,
    priceGold: 3,
    previewLabel: 'Improved accuracy'
  },
  {
    id: 'gun_t3',
    label: 'Pistol Mk.III',
    arenaWeaponType: 'gun',
    tierKey: 'tier1',
    upgradeLevel: 3,
    priceGold: 7,
    previewLabel: 'High-caliber rounds'
  },
  {
    id: 'shotgun_t1',
    label: 'Shotgun',
    arenaWeaponType: 'shotgun',
    tierKey: 'tier2',
    upgradeLevel: 1,
    priceGold: 0,
    previewLabel: 'Close-range spread'
  },
  {
    id: 'shotgun_t2',
    label: 'Shotgun Mk.II',
    arenaWeaponType: 'shotgun',
    tierKey: 'tier2',
    upgradeLevel: 2,
    priceGold: 5,
    previewLabel: 'Wider pellet cone'
  },
  {
    id: 'shotgun_t3',
    label: 'Shotgun Mk.III',
    arenaWeaponType: 'shotgun',
    tierKey: 'tier2',
    upgradeLevel: 3,
    priceGold: 10,
    previewLabel: 'Explosive shells'
  },
  {
    id: 'minigun_t1',
    label: 'Minigun',
    arenaWeaponType: 'minigun',
    tierKey: 'tier3',
    upgradeLevel: 1,
    priceGold: 0,
    previewLabel: 'Heavy sustained fire'
  },
  {
    id: 'minigun_t2',
    label: 'Minigun Mk.II',
    arenaWeaponType: 'minigun',
    tierKey: 'tier3',
    upgradeLevel: 2,
    priceGold: 10,
    previewLabel: 'Higher spin-up speed'
  },
  {
    id: 'minigun_t3',
    label: 'Minigun Mk.III',
    arenaWeaponType: 'minigun',
    tierKey: 'tier3',
    upgradeLevel: 3,
    priceGold: 18,
    previewLabel: 'Depleted uranium rounds'
  }
]

export function getLoadoutWeaponDefinition(weaponId: string): LoadoutWeaponDefinition | null {
  return LOADOUT_WEAPON_DEFINITIONS.find((w) => w.id === weaponId) ?? null
}

export function getWeaponUpgrades(weaponType: ArenaWeaponType): LoadoutWeaponDefinition[] {
  return LOADOUT_WEAPON_DEFINITIONS.filter((w) => w.arenaWeaponType === weaponType)
}

export function getArenaWeaponModelPath(weaponType: ArenaWeaponType, upgradeLevel: number): string {
  const level = Math.max(1, Math.min(3, upgradeLevel))
  if (weaponType === 'gun') {
    if (level === 3) return 'assets/scene/Models/drones/gun/DroneGunGold.glb'
    if (level === 2) return 'assets/scene/Models/drones/gun/DroneGunUp1.glb'
    return 'assets/scene/Models/drones/gun/DroneGun.glb'
  }
  if (weaponType === 'shotgun') {
    if (level === 3) return 'assets/scene/Models/drones/shotgun/DroneShotGunGold.glb'
    if (level === 2) return 'assets/scene/Models/drones/shotgun/DroneShotGunUp1.glb'
    return 'assets/scene/Models/drones/shotgun/DroneShotGun.glb'
  }
  if (weaponType === 'minigun') {
    if (level === 3) return 'assets/scene/Models/drones/minigun/DroneMinigunGold.glb'
    if (level === 2) return 'assets/scene/Models/drones/minigun/DroneMinigunUp1.glb'
    return 'assets/scene/Models/drones/minigun/DroneMinigun.glb'
  }
  return 'assets/scene/Models/drones/gun/DroneGun.glb'
}

export function getArenaWeaponShootClip(weaponType: ArenaWeaponType, upgradeLevel: number): string {
  const level = Math.max(1, Math.min(3, upgradeLevel))
  if (weaponType === 'gun') {
    if (level === 3) return 'DroneGunGoldShoot'
    if (level === 2) return 'DroneGunUp1Shoot'
    return 'DroneGunShoot'
  }
  if (weaponType === 'shotgun') {
    if (level === 3) return 'DroneShotGunGoldShoot'
    if (level === 2) return 'DroneShotGunUp1Shoot'
    return 'DroneShotGunShoot'
  }
  if (weaponType === 'minigun') {
    if (level === 3) return 'DroneMinigunGoldShoot'
    if (level === 2) return 'DroneMinigunUp1Shoot'
    return 'DroneMinigunShoot'
  }
  return 'DroneGunShoot'
}
