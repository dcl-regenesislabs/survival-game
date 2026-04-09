import { Vector3 } from '@dcl/sdk/math'
import {
  ARENA_FLOOR_POSITION_X,
  ARENA_FLOOR_POSITION_Z,
  ARENA_FLOOR_WORLD_SIZE_X,
  ARENA_FLOOR_WORLD_SIZE_Z
} from './arenaConfig'

export const LAVA_MODEL_SRCS = [
  'assets/asset-packs/lava/lava.glb',
  'assets/asset-packs/lava_2/lava_02.glb',
  'assets/asset-packs/lava_3/lava_03.glb'
] as const

export const LAVA_FIRST_WAVE = 1
export const LAVA_ZONE_WORLD_SIZE = 4
export const LAVA_WORLD_MIN_X = ARENA_FLOOR_POSITION_X
export const LAVA_WORLD_MIN_Z = ARENA_FLOOR_POSITION_Z
export const LAVA_WORLD_SIZE_X = ARENA_FLOOR_WORLD_SIZE_X
export const LAVA_WORLD_SIZE_Z = ARENA_FLOOR_WORLD_SIZE_Z
export const LAVA_GRID_SIZE_X = Math.floor(LAVA_WORLD_SIZE_X / LAVA_ZONE_WORLD_SIZE)
export const LAVA_GRID_SIZE_Z = Math.floor(LAVA_WORLD_SIZE_Z / LAVA_ZONE_WORLD_SIZE)
export const LAVA_GRID_SIZE = Math.min(LAVA_GRID_SIZE_X, LAVA_GRID_SIZE_Z)
export const LAVA_TILE_SCALE_XZ = LAVA_ZONE_WORLD_SIZE
export const LAVA_TILE_WARNING_SCALE_Y = 0.04
export const LAVA_TILE_ACTIVE_SCALE_Y = 0.1
export const LAVA_TILE_HIDDEN_SCALE_Y = 0.001
export const LAVA_WARNING_DURATION_MS = 1400
export const LAVA_DAMAGE_INTERVAL_MS = 2400
export const LAVA_STATIC_ACTIVE_MS = 6500
export const LAVA_SAFE_ZONE_ACTIVE_MS = 7500
export const LAVA_SWEEP_WARNING_MS = 850
export const LAVA_SWEEP_STEP_INTERVAL_MS = 260
export const LAVA_SWEEP_ACTIVE_MS = 1250

export type LavaHazardTileState = {
  lavaId: string
  gridX: number
  gridZ: number
  modelVariant: number
  rotationQuarterTurns: number
  warningAtMs: number
  activeAtMs: number
  expiresAtMs: number
}

export function shouldSpawnLavaForWave(waveNumber: number): boolean {
  return waveNumber >= LAVA_FIRST_WAVE
}

export function getLavaWaveTier(waveNumber: number): number {
  if (waveNumber >= 16) return 4
  if (waveNumber >= 12) return 3
  if (waveNumber >= 8) return 2
  return 1
}

export function getLavaTileKey(gridX: number, gridZ: number): string {
  return `${gridX}:${gridZ}`
}

export function isLavaGridInBounds(gridX: number, gridZ: number): boolean {
  return gridX >= 0 && gridZ >= 0 && gridX < LAVA_GRID_SIZE_X && gridZ < LAVA_GRID_SIZE_Z
}

export function getLavaWorldPosition(gridX: number, gridZ: number, scaleY: number = LAVA_TILE_ACTIVE_SCALE_Y): Vector3 {
  return Vector3.create(
    LAVA_WORLD_MIN_X + gridX * LAVA_ZONE_WORLD_SIZE + LAVA_ZONE_WORLD_SIZE * 0.5,
    scaleY * 0.5,
    LAVA_WORLD_MIN_Z + gridZ * LAVA_ZONE_WORLD_SIZE + LAVA_ZONE_WORLD_SIZE * 0.5
  )
}

export function getLavaGridCoordsFromWorld(positionX: number, positionZ: number): { gridX: number; gridZ: number } | null {
  const gridX = Math.floor((positionX - LAVA_WORLD_MIN_X) / LAVA_ZONE_WORLD_SIZE)
  const gridZ = Math.floor((positionZ - LAVA_WORLD_MIN_Z) / LAVA_ZONE_WORLD_SIZE)
  if (!isLavaGridInBounds(gridX, gridZ)) return null
  return { gridX, gridZ }
}
