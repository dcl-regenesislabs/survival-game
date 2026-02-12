import { engine, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'

export const MAX_HP = 5

let currentHp = MAX_HP
let isDead = false
let deathTime = 0

/** Respawn position in scene (center of play area) */
const RESPAWN_POSITION = Vector3.create(32, 0, 32)
const RESPAWN_DELAY = 2 // seconds to show "You Died" before respawning

export function getPlayerHp(): number {
  return currentHp
}

export function isPlayerDead(): boolean {
  return isDead
}

export function setDeathTime(time: number): void {
  deathTime = time
}

export function getDeathTime(): number {
  return deathTime
}

export function getRespawnDelay(): number {
  return RESPAWN_DELAY
}

/** Deal damage to the player. Caller should spawn blood at player position. Returns true if player died. */
export function damagePlayer(amount: number): boolean {
  if (isDead) return false
  currentHp = Math.max(0, currentHp - amount)

  if (currentHp <= 0) {
    isDead = true
    return true
  }
  return false
}

/** Respawn player: move to spawn, restore HP, clear death state. */
export function respawnPlayer(): void {
  movePlayerTo({
    newRelativePosition: { x: RESPAWN_POSITION.x, y: RESPAWN_POSITION.y, z: RESPAWN_POSITION.z },
    cameraTarget: { x: RESPAWN_POSITION.x, y: 1, z: RESPAWN_POSITION.z + 1 }
  })
  currentHp = MAX_HP
  isDead = false
}
