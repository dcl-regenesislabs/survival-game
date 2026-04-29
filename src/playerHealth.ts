import { engine, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { getCurrentRoomConfig } from './roomRuntime'
import { getServerTime } from './shared/timeSync'

export const MAX_HP = 5
export const MAX_LIVES = 2

let currentHp = MAX_HP
let isDead = false
let respawnAtMs = 0
let currentLives = MAX_LIVES
let healGlowEndTime = 0
let diedAtMs = 0
let damageOverlayTriggeredAtMs = 0
let damageOverlayPeakAlpha = 0
let hasReceivedAuthoritativeHealthState = false
let predictedDamageFeedbackAmount = 0
let predictedDamageFeedbackAtMs = 0

const RESPAWN_DELAY = 5 // seconds to show "You Died" before respawning
const DEATH_OVERLAY_DELAY_MS = 0
const DAMAGE_OVERLAY_HOLD_MS = 80
const DAMAGE_OVERLAY_FADE_OUT_MS = 560
const DAMAGE_OVERLAY_BASE_ALPHA = 0.12
const DAMAGE_OVERLAY_ALPHA_PER_HP = 0.05
const DAMAGE_OVERLAY_MAX_ALPHA = 0.26
const PREDICTED_DAMAGE_FEEDBACK_SUPPRESS_MS = 2500
const DEAD_MOVEMENT_LOCK_DISTANCE_SQ = 0.0025

let deathMovementLockPosition: Vector3 | null = null
let deathMovementLockSystemInitialized = false

export function getPlayerHp(): number {
  return currentHp
}

export function isPlayerDead(): boolean {
  return isDead
}

export function getRespawnDelay(): number {
  return RESPAWN_DELAY
}

export function getRespawnAtMs(): number {
  return respawnAtMs
}

export function getPlayerLives(): number {
  return currentLives
}

export function hasLivesRemaining(): boolean {
  return currentLives > 0
}

export function shouldShowDeathOverlay(nowMs: number): boolean {
  if (!isDead) return false
  if (diedAtMs <= 0) return true
  return nowMs - diedAtMs >= DEATH_OVERLAY_DELAY_MS
}

export function getPlayerDamageOverlayAlpha(nowMs: number): number {
  if (damageOverlayTriggeredAtMs <= 0 || damageOverlayPeakAlpha <= 0) return 0

  const elapsedMs = nowMs - damageOverlayTriggeredAtMs
  if (elapsedMs <= DAMAGE_OVERLAY_HOLD_MS) return damageOverlayPeakAlpha
  if (elapsedMs >= DAMAGE_OVERLAY_HOLD_MS + DAMAGE_OVERLAY_FADE_OUT_MS) return 0

  const fadeProgress = Math.max(0, Math.min(1, (elapsedMs - DAMAGE_OVERLAY_HOLD_MS) / DAMAGE_OVERLAY_FADE_OUT_MS))
  return damageOverlayPeakAlpha * Math.pow(1 - fadeProgress, 2)
}

export function resetPlayerHealthState(): void {
  currentHp = MAX_HP
  isDead = false
  respawnAtMs = 0
  deathMovementLockPosition = null
  healGlowEndTime = 0
  diedAtMs = 0
  damageOverlayTriggeredAtMs = 0
  damageOverlayPeakAlpha = 0
  hasReceivedAuthoritativeHealthState = false
  predictedDamageFeedbackAmount = 0
  predictedDamageFeedbackAtMs = 0
}

/** Full reset including lives — call when returning to lobby between runs. */
export function resetPlayerHealthAndLives(): void {
  currentLives = MAX_LIVES
  resetPlayerHealthState()
}

/** Restore player health (e.g. health potion). Caps at MAX_HP. No-op if dead. */
export function healPlayer(amount: number): void {
  if (isDead) return
  currentHp = Math.min(MAX_HP, currentHp + amount)
}

/** Set end time for heal glow on player health bar (call with getGameTime() + duration). */
export function setHealGlowEndTime(endTime: number): void {
  healGlowEndTime = endTime
}

/** Used by health bar to show glow animation after using health potion. */
export function getHealGlowEndTime(): number {
  return healGlowEndTime
}

function triggerDamageOverlay(damageTaken: number, nowMs: number): void {
  if (damageTaken <= 0) return

  const normalizedDamage = Math.max(1, Math.floor(damageTaken))
  damageOverlayTriggeredAtMs = nowMs
  damageOverlayPeakAlpha = Math.min(
    DAMAGE_OVERLAY_MAX_ALPHA,
    DAMAGE_OVERLAY_BASE_ALPHA + normalizedDamage * DAMAGE_OVERLAY_ALPHA_PER_HP
  )
}

export function triggerPredictedDamageFeedback(damageTaken: number): void {
  if (isDead) return

  const nowMs = getServerTime()
  const normalizedDamage = Math.max(1, Math.floor(damageTaken))
  predictedDamageFeedbackAmount += normalizedDamage
  predictedDamageFeedbackAtMs = nowMs
  triggerDamageOverlay(normalizedDamage, nowMs)
}

function captureDeathMovementLockPosition(): void {
  if (!Transform.has(engine.PlayerEntity)) return
  const position = Transform.get(engine.PlayerEntity).position
  deathMovementLockPosition = Vector3.create(position.x, position.y, position.z)
}

function deadMovementLockSystem(): void {
  if (!isDead || !deathMovementLockPosition || !Transform.has(engine.PlayerEntity)) return

  const currentPosition = Transform.get(engine.PlayerEntity).position
  const dx = currentPosition.x - deathMovementLockPosition.x
  const dy = currentPosition.y - deathMovementLockPosition.y
  const dz = currentPosition.z - deathMovementLockPosition.z
  const distanceSq = dx * dx + dy * dy + dz * dz
  if (distanceSq <= DEAD_MOVEMENT_LOCK_DISTANCE_SQ) return

  void movePlayerTo({
    newRelativePosition: {
      x: deathMovementLockPosition.x,
      y: deathMovementLockPosition.y,
      z: deathMovementLockPosition.z
    }
  })
}

export function initPlayerDeathMovementLockSystem(): void {
  if (deathMovementLockSystemInitialized) return
  deathMovementLockSystemInitialized = true
  engine.addSystem(deadMovementLockSystem, undefined, 'player-death-movement-lock-system')
}

/** Respawn player: move to spawn, restore HP, clear death state. */
export function respawnPlayer(): void {
  const roomConfig = getCurrentRoomConfig()
  const respawnPosition = roomConfig.respawnPosition
  const respawnLookAt = roomConfig.respawnLookAt
  movePlayerTo({
    newRelativePosition: { x: respawnPosition.x, y: respawnPosition.y, z: respawnPosition.z },
    cameraTarget: { x: respawnLookAt.x, y: respawnLookAt.y, z: respawnLookAt.z }
  })
  resetPlayerHealthState()
}

/** Apply server-authoritative player health snapshot. */
export function applyAuthoritativeHealthState(hp: number, dead: boolean, nextRespawnAtMs: number, lives?: number): void {
  const nowMs = getServerTime()
  const wasDead = isDead
  const previousHp = currentHp
  const nextHp = Math.max(0, Math.min(MAX_HP, Math.floor(hp)))

  if (hasReceivedAuthoritativeHealthState && nextHp < previousHp) {
    const damageTaken = previousHp - nextHp
    const shouldSuppressDuplicateFeedback =
      predictedDamageFeedbackAmount > 0 &&
      nowMs - predictedDamageFeedbackAtMs <= PREDICTED_DAMAGE_FEEDBACK_SUPPRESS_MS

    if (shouldSuppressDuplicateFeedback) {
      predictedDamageFeedbackAmount = Math.max(0, predictedDamageFeedbackAmount - damageTaken)
      if (predictedDamageFeedbackAmount === 0) predictedDamageFeedbackAtMs = 0
    } else {
      triggerDamageOverlay(damageTaken, nowMs)
    }
  }

  currentHp = nextHp
  isDead = dead
  respawnAtMs = nextRespawnAtMs
  if (lives !== undefined) currentLives = Math.max(0, lives)
  hasReceivedAuthoritativeHealthState = true

  if (!wasDead && dead) {
    diedAtMs = nextRespawnAtMs > 0 ? nextRespawnAtMs - RESPAWN_DELAY * 1000 : nowMs
    captureDeathMovementLockPosition()
  }

  if (wasDead && !isDead) {
    // Server-authoritative respawn transition: move player back to the arena spawn.
    respawnPlayer()
  }
}
