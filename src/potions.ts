import {
  engine,
  Entity,
  Transform,
  GltfContainer,
  Schemas
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { healPlayer, MAX_HP, setHealGlowEndTime } from './playerHealth'
import { applyRageEffect } from './rageEffect'
import { getGameTime } from './zombie'

const HEALTH_POTION_GLB = 'assets/asset-packs/green_plasma/PlasmaGreen_01/PlasmaGreen_01.glb'
const RAGE_POTION_GLB = 'assets/asset-packs/pink_plasma/PlasmaPink_01/PlasmaPink_01.glb'

const HEALTH_POTION_SCALE = 3
const RAGE_POTION_SCALE = 4
const PICKUP_RADIUS = 2 // walk into this range (XZ) to pick up
// Center of plasma is at this height; pivot offset puts model bottom at ~0.4 above floor
const POTION_HEIGHT_ABOVE_GROUND = 1.5
const POTION_TILT_DEG = 45 // inclination from vertical
const POTION_SPIN_DEG_PER_SEC = 90 // horizontal spin speed
const POTION_LIFETIME_SEC = 20 // disappear if not picked up
// Offset so rotation is around the model's visual center (plasma has pivot at bottom)
const POTION_PIVOT_OFFSET_Y = -0.5

// Tag potions so we know what to do on pickup; root entity has rotation, child has the GLB
const PotionPickupSchema = {
  isHealth: Schemas.Boolean,
  removeAtTime: Schemas.Number,
  childEntity: Schemas.Entity
}
const PotionPickupComponent = engine.defineComponent('PotionPickup', PotionPickupSchema)

function spawnHealthPotion(position: Vector3): void {
  const root = engine.addEntity()
  const child = engine.addEntity()
  const centerY = position.y + POTION_HEIGHT_ABOVE_GROUND
  Transform.create(root, {
    position: Vector3.create(position.x, centerY, position.z),
    rotation: Quaternion.Identity(),
    scale: Vector3.create(HEALTH_POTION_SCALE, HEALTH_POTION_SCALE, HEALTH_POTION_SCALE)
  })
  Transform.create(child, {
    parent: root,
    position: Vector3.create(0, POTION_PIVOT_OFFSET_Y, 0),
    rotation: Quaternion.Identity(),
    scale: Vector3.One()
  })
  GltfContainer.create(child, {
    src: HEALTH_POTION_GLB,
    visibleMeshesCollisionMask: 0,
    invisibleMeshesCollisionMask: 0
  })
  PotionPickupComponent.create(root, {
    isHealth: true,
    removeAtTime: getGameTime() + POTION_LIFETIME_SEC,
    childEntity: child
  })
}

function spawnRagePotion(position: Vector3): void {
  const root = engine.addEntity()
  const child = engine.addEntity()
  const centerY = position.y + POTION_HEIGHT_ABOVE_GROUND
  Transform.create(root, {
    position: Vector3.create(position.x, centerY, position.z),
    rotation: Quaternion.Identity(),
    scale: Vector3.create(RAGE_POTION_SCALE, RAGE_POTION_SCALE, RAGE_POTION_SCALE)
  })
  Transform.create(child, {
    parent: root,
    position: Vector3.create(0, POTION_PIVOT_OFFSET_Y, 0),
    rotation: Quaternion.Identity(),
    scale: Vector3.One()
  })
  GltfContainer.create(child, {
    src: RAGE_POTION_GLB,
    visibleMeshesCollisionMask: 0,
    invisibleMeshesCollisionMask: 0
  })
  PotionPickupComponent.create(root, {
    isHealth: false,
    removeAtTime: getGameTime() + POTION_LIFETIME_SEC,
    childEntity: child
  })
}

function removePotion(root: Entity, potion: { childEntity: Entity }): void {
  engine.removeEntity(potion.childEntity)
  engine.removeEntity(root)
}

/** Update potion rotation: 45° inclination + horizontal spin (around world Y). */
export function potionVisualSystem(): void {
  const t = getGameTime()
  const spinY = (t * POTION_SPIN_DEG_PER_SEC) % 360
  const tiltX = POTION_TILT_DEG
  const tilt = Quaternion.fromEulerDegrees(tiltX, 0, 0)
  const spin = Quaternion.fromEulerDegrees(0, spinY, 0)
  const rot = Quaternion.multiply(spin, tilt)
  for (const [entity] of engine.getEntitiesWith(PotionPickupComponent, Transform)) {
    Transform.getMutable(entity).rotation = rot
  }
}

function distanceXZ(a: Vector3, b: Vector3): number {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dz * dz)
}

/** Run every frame: pickup when player is in range; remove expired potions (20s). */
export function potionPickupSystem(): void {
  const now = getGameTime()
  const playerPos = Transform.has(engine.PlayerEntity)
    ? Transform.get(engine.PlayerEntity).position
    : null

  const toRemove: Entity[] = []
  for (const [entity, potion, transform] of engine.getEntitiesWith(
    PotionPickupComponent,
    Transform
  )) {
    if (now >= potion.removeAtTime) {
      toRemove.push(entity)
      continue
    }
    if (playerPos) {
      const dist = distanceXZ(playerPos, transform.position)
      if (dist <= PICKUP_RADIUS) {
        if (potion.isHealth) {
          healPlayer(MAX_HP)
          setHealGlowEndTime(now + 1.5)
        } else {
          applyRageEffect(now)
        }
        toRemove.push(entity)
      }
    }
  }
  for (const e of toRemove) {
    const potion = PotionPickupComponent.get(e)
    removePotion(e, potion)
  }
}

/** Roll for and spawn health (5%) and rage (5%) potions at the given position (e.g. zombie death position). */
export function tryDropPotions(position: Vector3): void {
  if (Math.random() < 0.05) spawnHealthPotion(position)
  if (Math.random() < 0.05) spawnRagePotion(position)
}
