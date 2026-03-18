export const SPEED_DURATION_SEC = 10
const SPEED_FIRE_RATE_MULTIPLIER = 2
const SPEED_PICKUP_FLASH_SEC = 0.65

let speedEndTime = 0
let speedPickupFlashEndTime = 0

export function speedEffectSystem(gameTime: number): void {
  if (speedEndTime > 0 && gameTime >= speedEndTime) {
    speedEndTime = 0
  }
  if (speedPickupFlashEndTime > 0 && gameTime >= speedPickupFlashEndTime) {
    speedPickupFlashEndTime = 0
  }
}

export function applySpeedEffect(gameTime: number): void {
  speedEndTime = gameTime + SPEED_DURATION_SEC
  speedPickupFlashEndTime = gameTime + SPEED_PICKUP_FLASH_SEC
}

export function isSpeedActive(): boolean {
  return speedEndTime > 0
}

export function getSpeedTimeLeft(gameTime: number): number {
  if (speedEndTime <= 0) return 0
  return Math.max(0, speedEndTime - gameTime)
}

export function getFireRateMultiplier(): number {
  return isSpeedActive() ? SPEED_FIRE_RATE_MULTIPLIER : 1
}

export function getSpeedPickupFlashTimeLeft(gameTime: number): number {
  if (speedPickupFlashEndTime <= 0) return 0
  return Math.max(0, speedPickupFlashEndTime - gameTime)
}
