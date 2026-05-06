import { PlayerLoadoutSnapshot } from './loadoutState'

// Temporary UI sandbox for rebuilding the shop without gameplay/server noise.
export const DEBUG_SHOP_UI_ONLY = false

export const DEBUG_SHOP_UI_ONLY_LOADOUT: PlayerLoadoutSnapshot = {
  gold: 30,
  ownedWeaponIds: ['gun_t1', 'shotgun_t1', 'minigun_t1'],
  equippedWeaponIds: ['gun_t1', 'shotgun_t1', 'minigun_t1']
}
