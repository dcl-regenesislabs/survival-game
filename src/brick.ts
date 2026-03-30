import {
  engine,
  Entity,
  Transform,
  GltfContainer,
  MeshRenderer,
  Material,
  MeshCollider,
  ColliderLayer,
  Schemas
} from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { Vector3, Quaternion, Color3, Color4 } from '@dcl/sdk/math'
import { spendZombieCoins } from './zombieCoins'
import { ARENA_BRICK_MAX_X, ARENA_BRICK_MAX_Z, ARENA_BRICK_MIN_X, ARENA_BRICK_MIN_Z } from './shared/arenaConfig'
import {
  BRICK_COST_BASE,
  BRICK_COST_TIER_2, BRICK_COST_TIER_2_WAVE,
  BRICK_COST_TIER_3, BRICK_COST_TIER_3_WAVE,
  BRICK_COST_TIER_4, BRICK_COST_TIER_4_WAVE
} from './shared/matchConfig'
import { getCurrentWave } from './waveManager'

const BRICK_GLB = 'assets/asset-packs/bricks_-_red/brick_red.glb'
export const BRICK_HP = 5
/** Base brick cost — use getBrickCost() for the wave-adjusted price. */
export const BRICK_COST_ZC = BRICK_COST_BASE

export function getBrickCost(): number {
  const wave = getCurrentWave()
  if (wave >= BRICK_COST_TIER_4_WAVE) return BRICK_COST_TIER_4
  if (wave >= BRICK_COST_TIER_3_WAVE) return BRICK_COST_TIER_3
  if (wave >= BRICK_COST_TIER_2_WAVE) return BRICK_COST_TIER_2
  return BRICK_COST_BASE
}

// Obstacle radius for collision (brick footprint) – zombies cannot move inside this
export const BRICK_RADIUS = 0.6

const BrickSchema = {
  health: Schemas.Number,
  position: Schemas.Vector3
}
export const BrickComponent = engine.defineComponent('BrickComponent', BrickSchema, {
  health: BRICK_HP,
  position: { x: 0, y: 0, z: 0 }
})

const BRICK_BOX_MATERIAL = {
  albedoColor: Color4.create(0.6, 0.15, 0.1, 1),
  emissiveColor: Color3.create(0.3, 0.05, 0.02),
  emissiveIntensity: 0.1,
  metallic: 0.1,
  roughness: 0.85
}

const BRICK_SYNC_COMPONENT_IDS = [
  Transform.componentId,
  GltfContainer.componentId,
  MeshRenderer.componentId,
  Material.componentId,
  MeshCollider.componentId,
  BrickComponent.componentId
]

/** Spawn a brick at world position (y=0). Tries brick_red.glb, falls back to red box. */
export function spawnBrickAt(position: Vector3): Entity | null {
  const entity = engine.addEntity()
  const pos = Vector3.create(position.x, 0, position.z)
  Transform.create(entity, {
    position: Vector3.create(pos.x, pos.y, pos.z),
    rotation: Quaternion.Identity(),
    scale: Vector3.One()
  })
  try {
    GltfContainer.create(entity, {
      src: BRICK_GLB,
      visibleMeshesCollisionMask: 0,
      invisibleMeshesCollisionMask: 0
    })
  } catch {
    MeshRenderer.setBox(entity)
    Material.setPbrMaterial(entity, BRICK_BOX_MATERIAL)
  }
  MeshCollider.setBox(entity, ColliderLayer.CL_PHYSICS)
  BrickComponent.create(entity, { health: BRICK_HP, position: pos })
  syncEntity(entity, BRICK_SYNC_COMPONENT_IDS)
  return entity
}

/** Get all brick entities with position (from component so it's always valid). */
export function getBricks(): Array<{ entity: Entity; position: Vector3 }> {
  const out: Array<{ entity: Entity; position: Vector3 }> = []
  for (const [entity, brick] of engine.getEntitiesWith(BrickComponent)) {
    const p = brick.position
    out.push({ entity, position: Vector3.create(p.x, p.y, p.z) })
  }
  return out
}

/** Apply damage to a brick. Returns true if brick was destroyed. */
export function damageBrick(entity: Entity, amount: number): boolean {
  if (!BrickComponent.has(entity)) return false
  const brick = BrickComponent.getMutable(entity)
  brick.health -= amount
  if (brick.health <= 0) {
    engine.removeEntity(entity)
    return true
  }
  return false
}

const PLACE_DISTANCE = 1
const BRICK_TARGET_TIMEOUT_MS = 5000

// Grid snapping – all bricks align to a 1-unit grid so forts can be built cleanly
const GRID_SIZE = 1
// Arena play area bounds live in shared config; leave a 1-unit margin for brick placement
function snapToGrid(v: Vector3): Vector3 {
  const snappedX = Math.round(v.x / GRID_SIZE) * GRID_SIZE
  const snappedZ = Math.round(v.z / GRID_SIZE) * GRID_SIZE
  return Vector3.create(
    Math.max(ARENA_BRICK_MIN_X, Math.min(ARENA_BRICK_MAX_X, snappedX)),
    v.y,
    Math.max(ARENA_BRICK_MIN_Z, Math.min(ARENA_BRICK_MAX_Z, snappedZ))
  )
}
const BRICK_TARGET_PREVIEW_SCALE = 1.05
const BRICK_TARGET_PREVIEW_THICKNESS = BRICK_TARGET_PREVIEW_SCALE
const BRICK_TARGET_PREVIEW_Y = BRICK_TARGET_PREVIEW_THICKNESS / 2

const BRICK_TARGET_PREVIEW_MATERIAL = {
  albedoColor: Color4.create(0.95, 0.8, 0.12, 0.42),
  emissiveColor: Color3.create(0.55, 0.42, 0.06),
  emissiveIntensity: 0.2,
  metallic: 0,
  roughness: 1
}

// Deferred spawn: UI only requests; a system does the actual spawn next frame (avoids issues when creating entities from UI callback).
let pendingBrickPosition: Vector3 | null = null
let brickTargetModeUntilMs = 0
let brickTargetPreviewEntity: Entity | null = null

function getPlacementPositionFromPlayer(): Vector3 | null {
  if (!Transform.has(engine.PlayerEntity)) return null
  const t = Transform.get(engine.PlayerEntity)
  const forward = Vector3.rotate(Vector3.Forward(), t.rotation)
  forward.y = 0
  const dir = Vector3.normalize(forward)
  const placePos = Vector3.add(t.position, Vector3.scale(dir, PLACE_DISTANCE))
  placePos.y = 0
  const snapped = snapToGrid(placePos)
  return Vector3.create(snapped.x, 0, snapped.z)
}

function isTargetModeStillActive(nowMs: number): boolean {
  return brickTargetModeUntilMs > nowMs
}

function hideTargetPreview() {
  if (brickTargetPreviewEntity !== null && Transform.has(brickTargetPreviewEntity)) {
    Transform.getMutable(brickTargetPreviewEntity).scale = Vector3.Zero()
  }
}

function ensureTargetPreviewEntity(): Entity {
  if (brickTargetPreviewEntity !== null && Transform.has(brickTargetPreviewEntity)) {
    return brickTargetPreviewEntity
  }
  const entity = engine.addEntity()
  Transform.create(entity, {
    position: Vector3.Zero(),
    rotation: Quaternion.Identity(),
    scale: Vector3.Zero()
  })
  MeshRenderer.setBox(entity)
  Material.setPbrMaterial(entity, BRICK_TARGET_PREVIEW_MATERIAL)
  brickTargetPreviewEntity = entity
  return entity
}

function updateBrickTargetPreview(nowMs: number): void {
  if (!isTargetModeStillActive(nowMs)) {
    brickTargetModeUntilMs = 0
    hideTargetPreview()
    return
  }
  const placement = getPlacementPositionFromPlayer()
  if (!placement) {
    hideTargetPreview()
    return
  }
  const previewEntity = ensureTargetPreviewEntity()
  const previewTransform = Transform.getMutable(previewEntity)
  previewTransform.position = Vector3.create(placement.x, BRICK_TARGET_PREVIEW_Y, placement.z)
  previewTransform.rotation = Quaternion.Identity()
  previewTransform.scale = Vector3.create(BRICK_TARGET_PREVIEW_SCALE, BRICK_TARGET_PREVIEW_THICKNESS, BRICK_TARGET_PREVIEW_SCALE)
}

export function isBrickTargetModeActive(nowMs: number = Date.now()): boolean {
  return isTargetModeStillActive(nowMs)
}

export function activateBrickTargetMode(nowMs: number = Date.now()): boolean {
  if (!Transform.has(engine.PlayerEntity)) return false
  brickTargetModeUntilMs = nowMs + BRICK_TARGET_TIMEOUT_MS
  return true
}

export function cancelBrickTargetMode(): void {
  brickTargetModeUntilMs = 0
  hideTargetPreview()
}

export function confirmBrickPlacementFromTargetMode(nowMs: number = Date.now()): boolean {
  if (!isTargetModeStillActive(nowMs)) {
    cancelBrickTargetMode()
    return false
  }
  const placement = getPlacementPositionFromPlayer()
  if (!placement) {
    cancelBrickTargetMode()
    return false
  }
  if (!spendZombieCoins(getBrickCost())) return false
  pendingBrickPosition = placement
  cancelBrickTargetMode()
  return true
}

/** Request placing a brick next frame. Call from UI; costs ZC immediately, spawn happens in game loop. */
export function tryPlaceBrick(): boolean {
  const placement = getPlacementPositionFromPlayer()
  if (!placement) return false
  if (!spendZombieCoins(getBrickCost())) return false
  pendingBrickPosition = placement
  cancelBrickTargetMode()
  return true
}

function brickPlacementSystem(_dt: number) {
  updateBrickTargetPreview(Date.now())
  if (pendingBrickPosition === null) return
  spawnBrickAt(pendingBrickPosition)
  pendingBrickPosition = null
}

/** Run this from main() so deferred brick placement works. */
export function initBrickSystem() {
  engine.addSystem(brickPlacementSystem)
}

/** Remove all bricks (e.g. on game reset). */
export function despawnAllBricks(): void {
  pendingBrickPosition = null
  cancelBrickTargetMode()
  const toRemove: Entity[] = []
  for (const [entity] of engine.getEntitiesWith(BrickComponent)) {
    toRemove.push(entity)
  }
  for (const e of toRemove) engine.removeEntity(e)
}
