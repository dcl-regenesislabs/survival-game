import { engine, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { getCurrentRoomConfig } from './roomRuntime'
import { getServerTime } from './shared/timeSync'

export const MAX_HP = 5

let currentHp = MAX_HP
let isDead = false
let respawnAtMs = 0
let healGlowEndTime = 0
let diedAtMs = 0
let damageOverlayTriggeredAtMs = 0
let damageOverlayPeakAlpha = 0
let hasReceivedAuthoritativeHealthState = false

const RESPAWN_DELAY = 5 // seconds to show "You Died" before respawning
const DEATH_OVERLAY_DELAY_MS = 0
const DAMAGE_OVERLAY_HOLD_MS = 80
const DAMAGE_OVERLAY_FADE_OUT_MS = 560
const DAMAGE_OVERLAY_BASE_ALPHA = 0.12
const DAMAGE_OVERLAY_ALPHA_PER_HP = 0.05
const DAMAGE_OVERLAY_MAX_ALPHA = 0.26

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
  healGlowEndTime = 0
  diedAtMs = 0
  damageOverlayTriggeredAtMs = 0
  damageOverlayPeakAlpha = 0
  hasReceivedAuthoritativeHealthState = false
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
export function applyAuthoritativeHealthState(hp: number, dead: boolean, nextRespawnAtMs: number): void {
  const nowMs = getServerTime()
  const wasDead = isDead
  const previousHp = currentHp
  const nextHp = Math.max(0, Math.min(MAX_HP, Math.floor(hp)))

  if (hasReceivedAuthoritativeHealthState && nextHp < previousHp) {
    triggerDamageOverlay(previousHp - nextHp, nowMs)
  }

  currentHp = nextHp
  isDead = dead
  respawnAtMs = nextRespawnAtMs
  hasReceivedAuthoritativeHealthState = true

  if (!wasDead && dead) {
    diedAtMs = nextRespawnAtMs > 0 ? nextRespawnAtMs - RESPAWN_DELAY * 1000 : nowMs
  }

  if (wasDead && !isDead) {
    // Server-authoritative respawn transition: move player back to the arena spawn.
    respawnPlayer()
  }
}
