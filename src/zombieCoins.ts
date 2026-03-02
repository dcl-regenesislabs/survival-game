// Rebalanced economy: slower ZC gain so weapon tier unlocks feel meaningful.
export const COINS_PER_KILL = 5

let zombieCoins = 0

export function getZombieCoins(): number {
  return zombieCoins
}

export function addZombieCoins(amount: number): void {
  zombieCoins += amount
}

/** Spend coins if player has enough. Returns true if spent, false if not enough. */
export function spendZombieCoins(amount: number): boolean {
  if (zombieCoins < amount) return false
  zombieCoins -= amount
  return true
}

export function resetZombieCoins(): void {
  zombieCoins = 0
}
