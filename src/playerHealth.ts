import { engine, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { ARENA_CENTER } from './shared/arenaConfig'

export const MAX_HP = 5

let currentHp = MAX_HP
let isDead = false
let respawnAtMs = 0
let healGlowEndTime = 0
let diedAtMs = 0

/** Respawn position in scene (center of play area) */
const RESPAWN_POSITION = Vector3.create(ARENA_CENTER.x, 0, ARENA_CENTER.z)
const RESPAWN_DELAY = 5 // seconds to show "You Died" before respawning
const DEATH_OVERLAY_DELAY_MS = 1500

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

export function resetPlayerHealthState(): void {
  currentHp = MAX_HP
  isDead = false
  respawnAtMs = 0
  healGlowEndTime = 0
  diedAtMs = 0
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

/** Respawn player: move to spawn, restore HP, clear death state. */
export function respawnPlayer(): void {
  movePlayerTo({
    newRelativePosition: { x: RESPAWN_POSITION.x, y: RESPAWN_POSITION.y, z: RESPAWN_POSITION.z },
    cameraTarget: { x: RESPAWN_POSITION.x, y: 1, z: RESPAWN_POSITION.z + 1 }
  })
  resetPlayerHealthState()
}

/** Apply server-authoritative player health snapshot. */
export function applyAuthoritativeHealthState(hp: number, dead: boolean, nextRespawnAtMs: number): void {
  const wasDead = isDead
  currentHp = Math.max(0, Math.min(MAX_HP, Math.floor(hp)))
  isDead = dead
  respawnAtMs = nextRespawnAtMs

  if (!wasDead && dead) {
    diedAtMs = nextRespawnAtMs > 0 ? nextRespawnAtMs - RESPAWN_DELAY * 1000 : Date.now()
  }

  if (wasDead && !isDead) {
    // Server-authoritative respawn transition: move player back to the arena spawn.
    respawnPlayer()
  }
}
