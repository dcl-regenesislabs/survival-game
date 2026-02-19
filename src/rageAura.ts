import {
  engine,
  Entity,
  Transform,
  MeshRenderer,
  Material
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4, Color3 } from '@dcl/sdk/math'
import { isRaging } from './rageEffect'
import { getGameTime } from './zombie'

let auraEntity: Entity | null = null

const AURA_BASE_SCALE = 2.4
const AURA_PULSE_MIN = 0.92
const AURA_PULSE_MAX = 1.08
const AURA_HEIGHT_OFFSET = 1.0
const AURA_EMISSIVE_INTENSITY_MIN = 0.5
const AURA_EMISSIVE_INTENSITY_MAX = 1.2

function ensureAuraEntity(): Entity {
  if (auraEntity !== null && Transform.has(auraEntity)) {
    return auraEntity
  }
  const entity = engine.addEntity()
  Transform.create(entity, {
    parent: engine.PlayerEntity,
    position: Vector3.create(0, AURA_HEIGHT_OFFSET, 0),
    rotation: Quaternion.Identity(),
    scale: Vector3.Zero()
  })
  MeshRenderer.setSphere(entity)
  Material.setPbrMaterial(entity, {
    albedoColor: Color4.create(0.95, 0.15, 0.2, 0.35),
    emissiveColor: Color3.create(1, 0.25, 0.3),
    emissiveIntensity: AURA_EMISSIVE_INTENSITY_MAX,
    metallic: 0,
    roughness: 1
  })
  auraEntity = entity
  return entity
}

/** Show/hide and animate the red rage aura around the player. */
export function rageAuraSystem(): void {
  if (!Transform.has(engine.PlayerEntity)) return

  if (!isRaging()) {
    if (auraEntity !== null && Transform.has(auraEntity)) {
      Transform.getMutable(auraEntity).scale = Vector3.Zero()
    }
    return
  }

  const entity = ensureAuraEntity()
  const t = getGameTime()
  const pulse = 0.5 + 0.5 * Math.sin(t * 5)
  const scaleMul = AURA_PULSE_MIN + (AURA_PULSE_MAX - AURA_PULSE_MIN) * pulse
  const scale = AURA_BASE_SCALE * scaleMul
  const emissive =
    AURA_EMISSIVE_INTENSITY_MIN +
    (AURA_EMISSIVE_INTENSITY_MAX - AURA_EMISSIVE_INTENSITY_MIN) * pulse

  const mutableTransform = Transform.getMutable(entity)
  mutableTransform.scale = Vector3.create(scale, scale, scale)

  Material.setPbrMaterial(entity, {
    albedoColor: Color4.create(0.95, 0.15, 0.2, 0.35),
    emissiveColor: Color3.create(1, 0.25, 0.3),
    emissiveIntensity: emissive,
    metallic: 0,
    roughness: 1
  })
}

export function initRageAura(): void {
  engine.addSystem(rageAuraSystem)
}
