import { getZombieCoins, spendZombieCoins } from './zombieCoins'
import { createGun, destroyGun } from './gun'
import { createShotGun, destroyShotGun } from './shotGun'
import { createMiniGun, destroyMiniGun } from './miniGun'

export type WeaponType = 'gun' | 'shotgun' | 'minigun'

// Rebalanced unlock costs for a longer in-run progression curve.
const SHOTGUN_COST = 100
const MINIGUN_COST = 300

let currentWeapon: WeaponType = 'gun'
let shotgunUnlocked = false
let minigunUnlocked = false
let allowedLoadoutWeapons: WeaponType[] = ['gun']

export function getCurrentWeapon(): WeaponType {
  return currentWeapon
}

export function isShotgunUnlocked(): boolean {
  return shotgunUnlocked
}

export function isMinigunUnlocked(): boolean {
  return minigunUnlocked
}

export function isWeaponAllowedInLoadout(type: WeaponType): boolean {
  return allowedLoadoutWeapons.includes(type)
}

export function setAllowedLoadoutWeapons(weapons: WeaponType[]): void {
  const nextAllowed: WeaponType[] = ['gun']
  for (const weapon of weapons) {
    if (weapon === 'gun') continue
    if (nextAllowed.includes(weapon)) continue
    nextAllowed.push(weapon)
  }
  allowedLoadoutWeapons = nextAllowed

  if (!isWeaponAllowedInLoadout('shotgun')) {
    shotgunUnlocked = false
  }
  if (!isWeaponAllowedInLoadout('minigun')) {
    minigunUnlocked = false
  }
  if (!isWeaponAllowedInLoadout(currentWeapon)) {
    destroyCurrentWeapon()
    createWeapon('gun')
    currentWeapon = 'gun'
  }
}

export function canAffordShotgun(): boolean {
  return isWeaponAllowedInLoadout('shotgun') && getZombieCoins() >= SHOTGUN_COST
}

/** Minigun requires shotgun unlocked first, then 150 ZC. */
export function canAffordMinigun(): boolean {
  return isWeaponAllowedInLoadout('minigun') && shotgunUnlocked && getZombieCoins() >= MINIGUN_COST
}

function destroyCurrentWeapon(): void {
  if (currentWeapon === 'gun') destroyGun()
  else if (currentWeapon === 'shotgun') destroyShotGun()
  else if (currentWeapon === 'minigun') destroyMiniGun()
}

function createWeapon(type: WeaponType): void {
  if (type === 'gun') createGun()
  else if (type === 'shotgun') createShotGun()
  else if (type === 'minigun') createMiniGun()
}

/**
 * Switch to a weapon. If not yet unlocked, spends ZC (50 for shotgun, 150 for minigun).
 * Minigun requires shotgun to be unlocked first.
 * Returns true if switch happened, false if can't afford or requirements not met.
 */
export function switchTo(type: WeaponType): boolean {
  if (type === 'gun') {
    destroyCurrentWeapon()
    createWeapon('gun')
    currentWeapon = 'gun'
    return true
  }

  if (type === 'shotgun') {
    if (!isWeaponAllowedInLoadout('shotgun')) return false
    if (!shotgunUnlocked) {
      if (!spendZombieCoins(SHOTGUN_COST)) return false
      shotgunUnlocked = true
    }
    destroyCurrentWeapon()
    createWeapon('shotgun')
    currentWeapon = 'shotgun'
    return true
  }

  if (type === 'minigun') {
    if (!isWeaponAllowedInLoadout('minigun')) return false
    if (!shotgunUnlocked) return false
    if (!minigunUnlocked) {
      if (!spendZombieCoins(MINIGUN_COST)) return false
      minigunUnlocked = true
    }
    destroyCurrentWeapon()
    createWeapon('minigun')
    currentWeapon = 'minigun'
    return true
  }

  return false
}

export function resetArenaWeaponProgress(): void {
  shotgunUnlocked = false
  minigunUnlocked = false
  if (currentWeapon === 'gun') return
  destroyCurrentWeapon()
  createWeapon('gun')
  currentWeapon = 'gun'
}
