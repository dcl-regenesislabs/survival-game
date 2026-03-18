export const RAGE_DURATION_SEC = 10
export const RAGE_SHIELD_RADIUS = 1.6
export const RAGE_SHIELD_CONTACT_DAMAGE = 1
export const RAGE_SHIELD_HIT_INTERVAL_SEC = 0.5
let rageEndTime = 0

export function rageEffectSystem(gameTime: number): void {
  if (rageEndTime > 0 && gameTime >= rageEndTime) {
    rageEndTime = 0
  }
}

export function applyRageEffect(gameTime: number): void {
  rageEndTime = gameTime + RAGE_DURATION_SEC
}

export function isRaging(): boolean {
  return rageEndTime > 0
}

export function getRageTimeLeft(gameTime: number): number {
  if (rageEndTime <= 0) return 0
  return Math.max(0, rageEndTime - gameTime)
}

export function getRageShieldRadius(): number {
  return RAGE_SHIELD_RADIUS
}

export function getRageShieldContactDamage(): number {
  return RAGE_SHIELD_CONTACT_DAMAGE
}

export function getRageShieldHitIntervalSec(): number {
  return RAGE_SHIELD_HIT_INTERVAL_SEC
}
