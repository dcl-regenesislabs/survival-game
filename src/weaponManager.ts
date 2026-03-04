import { createGun, destroyGun } from './gun'
import { createShotGun, destroyShotGun } from './shotGun'
import { createMiniGun, destroyMiniGun } from './miniGun'
import { isLoadoutWeaponOwned } from './loadoutState'

export type WeaponType = 'gun' | 'shotgun' | 'minigun'

let currentWeapon: WeaponType = 'gun'
let arenaWeaponEnabled = false
let hasSpawnedWeapon = false

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
  if (!hasSpawnedWeapon) return
  if (currentWeapon === 'gun') destroyGun()
  else if (currentWeapon === 'shotgun') destroyShotGun()
  else if (currentWeapon === 'minigun') destroyMiniGun()
  hasSpawnedWeapon = false
}

function createWeapon(type: WeaponType): void {
  if (type === 'gun') createGun()
  else if (type === 'shotgun') createShotGun()
  else if (type === 'minigun') createMiniGun()
  hasSpawnedWeapon = true
}

export function switchTo(type: WeaponType): boolean {
  if (type === 'shotgun' && !isShotgunUnlocked()) return false
  if (type === 'minigun' && !isMinigunUnlocked()) return false

  const previousWeapon = currentWeapon
  currentWeapon = type

  if (!arenaWeaponEnabled) return true

  if (hasSpawnedWeapon && previousWeapon === type) return true

  destroyCurrentWeapon()
  createWeapon(type)
  return true
}

export function enableArenaWeapon(): void {
  arenaWeaponEnabled = true
  if (hasSpawnedWeapon) return
  createWeapon(currentWeapon)
}

export function resetArenaWeaponProgress(): void {
  destroyCurrentWeapon()
  arenaWeaponEnabled = false
  currentWeapon = 'gun'
}
