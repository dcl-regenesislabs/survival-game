import {
  engine,
  Entity,
  Transform,
  MeshRenderer,
  Material,
  Schemas
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4, Color3 } from '@dcl/sdk/math'
import { ZombieComponent, getGameTime } from './zombie'
import { getPlayerHp, MAX_HP, getHealGlowEndTime } from './playerHealth'

const HealthBarSchema = {
  parent: Schemas.Entity,
  maxHp: Schemas.Number,
  isPlayer: Schemas.Boolean,
  /** Height above parent feet (y offset). Used for zombies; player bar uses Transform parent + local position. */
  heightOffset: Schemas.Number
}
const HealthBarComponent = engine.defineComponent('HealthBarComponent', HealthBarSchema)

const BAR_WIDTH = 0.8
const BAR_HEIGHT = 0.14
const BAR_DEPTH = 0.1
/** Rotation smoothing: higher = snappier, lower = smoother. ~3–4 for a gentle, non-poppy feel. */
const BILLBOARD_SMOOTH_SPEED = 3.5
/** Default height above feet for regular zombies. */
const HEIGHT_DEFAULT = 1.9
/** Player bar: higher and larger than zombie bars. */
const HEIGHT_PLAYER = 2.5
const PLAYER_BAR_WIDTH = 1.2
const PLAYER_BAR_HEIGHT = 0.2
const PLAYER_BAR_DEPTH = 0.16

function getHealthColor(ratio: number): { albedo: Color4; emissive: Color3 } {
  if (ratio > 0.6) {
    return {
      albedo: Color4.create(0.2, 0.75, 0.2, 0.95),
      emissive: Color3.create(0.15, 0.5, 0.15)
    }
  }
  if (ratio > 0.33) {
    return {
      albedo: Color4.create(0.9, 0.75, 0.1, 0.95),
      emissive: Color3.create(0.5, 0.4, 0.05)
    }
  }
  return {
    albedo: Color4.create(0.85, 0.15, 0.1, 0.95),
    emissive: Color3.create(0.5, 0.08, 0.05)
  }
}

/** Create a billboard health bar above a zombie. heightOffset: regular 1.9, quick lower (e.g. 1.75), tank higher (e.g. 2.05). */
export function createHealthBarForZombie(zombie: Entity, maxHp: number, heightOffset: number = HEIGHT_DEFAULT): Entity {
  const bar = engine.addEntity()
  Transform.create(bar, {
    position: Vector3.create(0, heightOffset, 0),
    rotation: Quaternion.Identity(),
    scale: Vector3.create(BAR_WIDTH, BAR_HEIGHT, BAR_DEPTH)
  })
  MeshRenderer.setBox(bar)
  Material.setPbrMaterial(bar, {
    ...getHealthColor(1),
    emissiveIntensity: 0.25,
    metallic: 0,
    roughness: 0.9
  })
  HealthBarComponent.create(bar, { parent: zombie, maxHp, isPlayer: false, heightOffset })
  return bar
}

/** Create the player's health bar, parented to the player so it follows correctly. Call once at init. */
export function createHealthBarForPlayer(): Entity {
  const bar = engine.addEntity()
  Transform.create(bar, {
    position: Vector3.create(0, HEIGHT_PLAYER, 0),
    rotation: Quaternion.Identity(),
    scale: Vector3.create(PLAYER_BAR_WIDTH, PLAYER_BAR_HEIGHT, PLAYER_BAR_DEPTH),
    parent: engine.PlayerEntity
  })
  MeshRenderer.setBox(bar)
  Material.setPbrMaterial(bar, {
    ...getHealthColor(1),
    emissiveIntensity: 0.25,
    metallic: 0,
    roughness: 0.9
  })
  HealthBarComponent.create(bar, {
    parent: engine.PlayerEntity,
    maxHp: MAX_HP,
    isPlayer: true,
    heightOffset: HEIGHT_PLAYER
  })
  return bar
}

/** Remove all health bars (e.g. when resetting). */
export function removeAllHealthBars(): void {
  const toRemove: Entity[] = []
  for (const [entity] of engine.getEntitiesWith(HealthBarComponent)) {
    toRemove.push(entity)
  }
  for (const e of toRemove) engine.removeEntity(e)
}

function healthBarSystem(dt: number) {
  if (!Transform.has(engine.CameraEntity)) return

  const cameraPos = Transform.get(engine.CameraEntity).position
  const smoothFactor = 1 - Math.exp(-BILLBOARD_SMOOTH_SPEED * dt)
  const toRemove: Entity[] = []

  for (const [barEntity, barData, barTransform] of engine.getEntitiesWith(
    HealthBarComponent,
    Transform,
    MeshRenderer
  )) {
    const { parent, maxHp, isPlayer, heightOffset } = barData

    if (isPlayer) {
      if (!Transform.has(parent)) continue
    } else {
      if (!ZombieComponent.has(parent)) {
        toRemove.push(barEntity)
        continue
      }
    }

    const currentHp = isPlayer ? getPlayerHp() : ZombieComponent.get(parent).health
    const ratio = Math.max(0, Math.min(1, currentHp / maxHp))

    let barWorldPos: Vector3
    if (isPlayer) {
      // Player bar is parented: compute world position so billboard direction is correct.
      const parentT = Transform.get(parent)
      barWorldPos = Vector3.add(
        parentT.position,
        Vector3.rotate(barTransform.position, parentT.rotation)
      )
    } else {
      const parentPos = Transform.get(parent).position
      barWorldPos = Vector3.create(
        parentPos.x,
        parentPos.y + heightOffset,
        parentPos.z
      )
    }

    const dirToCamera = Vector3.subtract(cameraPos, barWorldPos)
    dirToCamera.y = 0
    const lenXZ = Math.sqrt(dirToCamera.x * dirToCamera.x + dirToCamera.z * dirToCamera.z)
    if (lenXZ < 0.001) continue
    const forward = Vector3.normalize(dirToCamera)
    const lookRotWorld = Quaternion.lookRotation(forward)

    const mutableTransform = Transform.getMutable(barEntity)
    if (!isPlayer) {
      mutableTransform.position = barWorldPos
    }
    // Target rotation (world for zombies; local for player so world result faces camera).
    let targetRot: Quaternion
    if (isPlayer) {
      const parentRot = Transform.get(parent).rotation
      const invParent = Quaternion.create(-parentRot.x, -parentRot.y, -parentRot.z, parentRot.w)
      targetRot = Quaternion.multiply(invParent, lookRotWorld)
    } else {
      targetRot = lookRotWorld
    }
    const currentRot = barTransform.rotation
    mutableTransform.rotation = Quaternion.slerp(currentRot, targetRot, smoothFactor)
    const width = isPlayer ? PLAYER_BAR_WIDTH : BAR_WIDTH
    const height = isPlayer ? PLAYER_BAR_HEIGHT : BAR_HEIGHT
    const depth = isPlayer ? PLAYER_BAR_DEPTH : BAR_DEPTH
    const fillWidth = Math.max(0.02, width * ratio)
    mutableTransform.scale = Vector3.create(fillWidth, height, depth)

    let colors = getHealthColor(ratio)
    let emissiveIntensity = 0.25
    if (isPlayer && getGameTime() < getHealGlowEndTime()) {
      const glowPhase = (getGameTime() * 4) % (2 * Math.PI)
      const pulse = 0.5 + 0.5 * Math.sin(glowPhase)
      emissiveIntensity = 0.4 + pulse * 0.5
      colors = {
        albedo: Color4.create(0.2, 1, 0.35, 0.95),
        emissive: Color3.create(0.2, 1, 0.3)
      }
    }
    Material.setPbrMaterial(barEntity, {
      albedoColor: colors.albedo,
      emissiveColor: colors.emissive,
      emissiveIntensity,
      metallic: 0,
      roughness: 0.9
    })
  }

  for (const e of toRemove) engine.removeEntity(e)
}

export function initHealthBarSystem(): void {
  engine.addSystem(healthBarSystem)
}
