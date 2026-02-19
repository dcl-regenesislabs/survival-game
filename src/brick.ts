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
import { Vector3, Quaternion, Color3, Color4 } from '@dcl/sdk/math'
import { spendZombieCoins } from './zombieCoins'

const BRICK_GLB = 'assets/asset-packs/bricks_-_red/brick_red.glb'
export const BRICK_HP = 10
export const BRICK_COST_ZC = 20

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

// Deferred spawn: UI only requests; a system does the actual spawn next frame (avoids issues when creating entities from UI callback).
let pendingBrickPosition: Vector3 | null = null

/** Request placing a brick next frame. Call from UI; costs ZC immediately, spawn happens in game loop. */
export function tryPlaceBrick(): boolean {
  if (!Transform.has(engine.PlayerEntity)) return false
  if (!spendZombieCoins(BRICK_COST_ZC)) return false
  const t = Transform.get(engine.PlayerEntity)
  const forward = Vector3.rotate(Vector3.Forward(), t.rotation)
  forward.y = 0
  const dir = Vector3.normalize(forward)
  const placePos = Vector3.add(t.position, Vector3.scale(dir, PLACE_DISTANCE))
  placePos.y = 0
  pendingBrickPosition = Vector3.create(placePos.x, placePos.y, placePos.z)
  return true
}

function brickPlacementSystem(_dt: number) {
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
  const toRemove: Entity[] = []
  for (const [entity] of engine.getEntitiesWith(BrickComponent)) {
    toRemove.push(entity)
  }
  for (const e of toRemove) engine.removeEntity(e)
}
