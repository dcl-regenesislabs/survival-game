import { engine, Entity, Material, MeshRenderer, Transform } from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { getSpeedPickupFlashTimeLeft, isSpeedActive } from './speedEffect'
import { getGameTime } from './zombie'

const SPEED_FLASH_DURATION_SEC = 0.65
const TORNADO_PARTICLE_COUNT = 8
const TORNADO_BASE_HEIGHT = 0.3
const TORNADO_HEIGHT_STEP = 0.23
const TORNADO_BASE_RADIUS = 0.22
const TORNADO_RADIUS_STEP = 0.075
const TORNADO_ROTATION_SPEED = 7.5
const TORNADO_VERTICAL_WAVE = 0.05
const TORNADO_BASE_SCALE = 0.11
const TORNADO_SCALE_STEP = 0.014
const TORNADO_FLASH_SCALE_BONUS = 0.08

const tornadoParticles: Entity[] = []

function ensureParticle(index: number): Entity {
  const existing = tornadoParticles[index]
  if (existing !== undefined && Transform.has(existing)) return existing

  const entity = engine.addEntity()
  Transform.create(entity, {
    parent: engine.PlayerEntity,
    position: Vector3.Zero(),
    rotation: Quaternion.Identity(),
    scale: Vector3.Zero()
  })
  MeshRenderer.setSphere(entity)

  const brightness = 0.78 + index * 0.025
  Material.setPbrMaterial(entity, {
    albedoColor: Color4.create(1, 0.9 + index * 0.01, 0.3, 0.9),
    emissiveColor: Color3.create(1, brightness, 0.24),
    emissiveIntensity: 1.6 + index * 0.08,
    metallic: 0,
    roughness: 0.35
  })

  tornadoParticles[index] = entity
  return entity
}

function hideAllParticles(): void {
  for (const entity of tornadoParticles) {
    if (Transform.has(entity)) {
      Transform.getMutable(entity).scale = Vector3.Zero()
    }
  }
}

export function speedAuraSystem(): void {
  if (!Transform.has(engine.PlayerEntity)) return

  const time = getGameTime()
  const flashTimeLeft = getSpeedPickupFlashTimeLeft(time)
  const flashRatio = Math.max(0, Math.min(1, flashTimeLeft / SPEED_FLASH_DURATION_SEC))
  if (!isSpeedActive() && flashRatio <= 0) {
    hideAllParticles()
    return
  }

  for (let index = 0; index < TORNADO_PARTICLE_COUNT; index += 1) {
    const particle = ensureParticle(index)
    const phase = index / TORNADO_PARTICLE_COUNT
    const angle = time * TORNADO_ROTATION_SPEED + phase * Math.PI * 2
    const radius =
      TORNADO_BASE_RADIUS +
      index * TORNADO_RADIUS_STEP +
      flashRatio * 0.06 +
      0.03 * Math.sin(time * 9 + index * 0.8)
    const height =
      TORNADO_BASE_HEIGHT +
      index * TORNADO_HEIGHT_STEP +
      TORNADO_VERTICAL_WAVE * Math.sin(time * 10 + index * 0.7)
    const scale = TORNADO_BASE_SCALE + index * TORNADO_SCALE_STEP + flashRatio * TORNADO_FLASH_SCALE_BONUS

    const mutableTransform = Transform.getMutable(particle)
    mutableTransform.position = Vector3.create(
      Math.cos(angle) * radius,
      height,
      Math.sin(angle) * radius
    )
    mutableTransform.scale = Vector3.create(scale, scale, scale)
  }
}

export function initSpeedAura(): void {
  engine.addSystem(speedAuraSystem)
}
