import { createGun, destroyGun } from './gun'
import { createShotGun, destroyShotGun } from './shotGun'
import { createMiniGun, destroyMiniGun } from './miniGun'
import { isLoadoutWeaponOwned } from './loadoutState'

export type WeaponType = 'gun' | 'shotgun' | 'minigun'

let currentWeapon: WeaponType = 'gun'

export function getCurrentWeapon(): WeaponType {
  return currentWeapon
}

export function isShotgunUnlocked(): boolean {
  return isLoadoutWeaponOwned('shotgun_pump')
}

export function isMinigunUnlocked(): boolean {
  return isLoadoutWeaponOwned('minigun_heavy')
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

export function switchTo(type: WeaponType): boolean {
  if (type === 'gun') {
    destroyCurrentWeapon()
    createWeapon('gun')
    currentWeapon = 'gun'
    return true
  }

  if (type === 'shotgun') {
    if (!isShotgunUnlocked()) return false
    destroyCurrentWeapon()
    createWeapon('shotgun')
    currentWeapon = 'shotgun'
    return true
  }

  if (type === 'minigun') {
    if (!isMinigunUnlocked()) return false
    destroyCurrentWeapon()
    createWeapon('minigun')
    currentWeapon = 'minigun'
    return true
  }

  return false
}

export function resetArenaWeaponProgress(): void {
  if (currentWeapon === 'gun') return
  destroyCurrentWeapon()
  createWeapon('gun')
  currentWeapon = 'gun'
}
