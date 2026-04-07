import { engine } from '@dcl/sdk/ecs'
import { createGun, destroyGun } from './gun'
import { createShotGun, destroyShotGun } from './shotGun'
import { createMiniGun, destroyMiniGun, resetMiniGunOverheatState } from './miniGun'
import { isPlayerDead } from './playerHealth'
import { spendZombieCoins } from './zombieCoins'
import { sendPlayerArenaWeaponChanged } from './multiplayer/lobbyClient'
import { getPlayerLoadoutSnapshot } from './loadoutState'
import { getLoadoutWeaponDefinition } from './shared/loadoutCatalog'

export type WeaponType = 'gun' | 'shotgun' | 'minigun'
export const SHOTGUN_UNLOCK_COST_ZC = 300
export const MINIGUN_UNLOCK_COST_ZC = 900

let currentWeapon: WeaponType = 'gun'
let arenaWeaponEnabled = false
let hasSpawnedWeapon = false
let weaponHiddenByDeath = false
let lifecycleSystemInitialized = false
let shotgunPurchasedInMatch = false
let minigunPurchasedInMatch = false
let spawnedWeaponUpgradeLevel = 1

export function getCurrentWeapon(): WeaponType {
  return currentWeapon
}

export function getWeaponUnlockCost(type: WeaponType): number {
  if (type === 'shotgun') return SHOTGUN_UNLOCK_COST_ZC
  if (type === 'minigun') return MINIGUN_UNLOCK_COST_ZC
  return 0
}

export function isWeaponPurchasedInMatch(type: WeaponType): boolean {
  if (type === 'gun') return true
  if (type === 'shotgun') return shotgunPurchasedInMatch
  return minigunPurchasedInMatch
}

export function isShotgunUnlocked(): boolean {
  return shotgunPurchasedInMatch
}

export function isMinigunUnlocked(): boolean {
  return minigunPurchasedInMatch
}

export function purchaseWeapon(type: WeaponType): boolean {
  if (!arenaWeaponEnabled) return false
  if (isWeaponPurchasedInMatch(type)) return true

  const cost = getWeaponUnlockCost(type)
  if (cost <= 0) return true
  if (!spendZombieCoins(cost)) return false

  if (type === 'shotgun') shotgunPurchasedInMatch = true
  else if (type === 'minigun') minigunPurchasedInMatch = true
  return true
}

function getEquippedUpgradeLevel(type: WeaponType): number {
  const snapshot = getPlayerLoadoutSnapshot()
  let matchedUpgradeLevel = 1
  for (const weaponId of snapshot.equippedWeaponIds) {
    const def = getLoadoutWeaponDefinition(weaponId)
    if (def?.arenaWeaponType === type) {
      matchedUpgradeLevel = Math.max(matchedUpgradeLevel, def.upgradeLevel)
    }
  }
  return matchedUpgradeLevel
}

function destroyCurrentWeapon(): void {
  if (!hasSpawnedWeapon) return
  if (currentWeapon === 'gun') destroyGun()
  else if (currentWeapon === 'shotgun') destroyShotGun()
  else if (currentWeapon === 'minigun') destroyMiniGun()
  hasSpawnedWeapon = false
  spawnedWeaponUpgradeLevel = 1
}

function createWeapon(type: WeaponType): void {
  const upgradeLevel = getEquippedUpgradeLevel(type)
  if (type === 'gun') createGun(upgradeLevel)
  else if (type === 'shotgun') createShotGun(upgradeLevel)
  else if (type === 'minigun') createMiniGun(upgradeLevel)
  hasSpawnedWeapon = true
  spawnedWeaponUpgradeLevel = upgradeLevel
  sendPlayerArenaWeaponChanged(type, upgradeLevel)
}

export function switchTo(type: WeaponType): boolean {
  if (!arenaWeaponEnabled) return false

  if (type === 'shotgun' && !isShotgunUnlocked()) return false
  if (type === 'minigun' && !isMinigunUnlocked()) return false

  const previousWeapon = currentWeapon
  if (hasSpawnedWeapon && previousWeapon === type) return true

  currentWeapon = previousWeapon
  destroyCurrentWeapon()
  currentWeapon = type
  createWeapon(type)
  return true
}

export function enableArenaWeapon(): void {
  arenaWeaponEnabled = true
  if (isPlayerDead()) return
  if (hasSpawnedWeapon) return
  createWeapon(currentWeapon)
}

export function resetArenaWeaponProgress(): void {
  destroyCurrentWeapon()
  hasSpawnedWeapon = false
  arenaWeaponEnabled = false
  currentWeapon = 'gun'
  weaponHiddenByDeath = false
  shotgunPurchasedInMatch = false
  minigunPurchasedInMatch = false
  resetMiniGunOverheatState()
}

function weaponLifecycleSystem(): void {
  if (!arenaWeaponEnabled) return

  if (isPlayerDead()) {
    if (hasSpawnedWeapon) {
      destroyCurrentWeapon()
      weaponHiddenByDeath = true
    }
    return
  }

  if (weaponHiddenByDeath && !hasSpawnedWeapon) {
    createWeapon(currentWeapon)
    weaponHiddenByDeath = false
    return
  }

  if (hasSpawnedWeapon) {
    const desiredUpgradeLevel = getEquippedUpgradeLevel(currentWeapon)
    if (desiredUpgradeLevel !== spawnedWeaponUpgradeLevel) {
      destroyCurrentWeapon()
      createWeapon(currentWeapon)
    }
  }
}

export function initWeaponLifecycleSystem(): void {
  if (lifecycleSystemInitialized) return
  lifecycleSystemInitialized = true
  engine.addSystem(weaponLifecycleSystem, undefined, 'weapon-lifecycle-system')
}
