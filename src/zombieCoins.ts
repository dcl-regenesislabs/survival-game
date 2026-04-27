// Rebalanced economy: slower ZC gain so weapon tier unlocks feel meaningful.
export const COINS_PER_KILL = 5

let zombieCoins = 0
const zombieCoinsListeners = new Set<(zombieCoins: number) => void>()

function emitZombieCoinsChanged(): void {
  for (const listener of zombieCoinsListeners) {
    listener(zombieCoins)
  }
}

export function getZombieCoins(): number {
  return zombieCoins
}

export function addZombieCoins(amount: number): void {
  zombieCoins = Math.max(0, zombieCoins + amount)
  emitZombieCoinsChanged()
}

/** Spend coins if player has enough. Returns true if spent, false if not enough. */
export function spendZombieCoins(amount: number): boolean {
  if (zombieCoins < amount) return false
  zombieCoins -= amount
  emitZombieCoinsChanged()
  return true
}

export function resetZombieCoins(): void {
  zombieCoins = 0
  emitZombieCoinsChanged()
}

export function onZombieCoinsChanged(listener: (zombieCoins: number) => void): () => void {
  zombieCoinsListeners.add(listener)
  return () => {
    zombieCoinsListeners.delete(listener)
  }
}
