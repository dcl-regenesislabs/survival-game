/**
 * Rage potion effect: 2x fire rate for a duration.
 * Weapons read getFireRateMultiplier() when deciding shoot interval.
 */

export const RAGE_DURATION_SEC = 10
let rageEndTime = 0

export function getFireRateMultiplier(): number {
  return rageEndTime > 0 ? 2 : 1
}

/** Call each frame with current game time to decay rage when duration ends. */
export function rageEffectSystem(gameTime: number): void {
  if (rageEndTime > 0 && gameTime >= rageEndTime) {
    rageEndTime = 0
  }
}

/** Apply rage potion: 2x fire rate for RAGE_DURATION_SEC. Call with current game time. */
export function applyRageEffect(gameTime: number): void {
  rageEndTime = gameTime + RAGE_DURATION_SEC
}

export function isRaging(): boolean {
  return rageEndTime > 0
}

/** Seconds left of rage (0 if not raging). Call with getGameTime(). */
export function getRageTimeLeft(gameTime: number): number {
  if (rageEndTime <= 0) return 0
  return Math.max(0, rageEndTime - gameTime)
}
