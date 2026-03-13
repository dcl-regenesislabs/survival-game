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

let ringRootEntity: Entity | null = null
const ringSegments: Entity[] = []

const RING_SEGMENT_COUNT = 8
const RING_RADIUS = 1.55
const RING_HEIGHT = 0.05
const RING_SEGMENT_WIDTH = 0.62
const RING_SEGMENT_DEPTH = 0.14
const RING_SEGMENT_THICKNESS = 0.045
const RING_ROTATION_SPEED = 1.3
const RING_BOB_HEIGHT = 0.02
const RING_PULSE_MIN = 0.92
const RING_PULSE_MAX = 1.08
const RING_EMISSIVE_MIN = 0.8
const RING_EMISSIVE_MAX = 1.75

function ensureAuraEntity(): Entity {
  if (ringRootEntity !== null && Transform.has(ringRootEntity)) {
    return ringRootEntity
  }

  const root = engine.addEntity()
  Transform.create(root, {
    parent: engine.PlayerEntity,
    position: Vector3.create(0, RING_HEIGHT, 0),
    rotation: Quaternion.Identity(),
    scale: Vector3.Zero()
  })

  for (let i = 0; i < RING_SEGMENT_COUNT; i++) {
    const segment = engine.addEntity()
    Transform.create(segment, {
      parent: root,
      position: Vector3.Zero(),
      rotation: Quaternion.Identity(),
      scale: Vector3.One()
    })
    MeshRenderer.setBox(segment)
    Material.setPbrMaterial(segment, {
      albedoColor: Color4.create(0.55, 0.05, 0.04, 0.95),
      emissiveColor: Color3.create(1, 0.18, 0.08),
      emissiveIntensity: RING_EMISSIVE_MAX,
      metallic: 0,
      roughness: 0.95
    })
    ringSegments.push(segment)
  }

  ringRootEntity = root
  return root
}

/** Show/hide and animate a segmented rage ring on the floor around the player. */
export function rageAuraSystem(): void {
  if (!Transform.has(engine.PlayerEntity)) return

  if (!isRaging()) {
    if (ringRootEntity !== null && Transform.has(ringRootEntity)) {
      Transform.getMutable(ringRootEntity).scale = Vector3.Zero()
    }
    return
  }

  const entity = ensureAuraEntity()
  const t = getGameTime()
  const pulse = 0.5 + 0.5 * Math.sin(t * 6.5)
  const rootScale = RING_PULSE_MIN + (RING_PULSE_MAX - RING_PULSE_MIN) * pulse
  const emissive = RING_EMISSIVE_MIN + (RING_EMISSIVE_MAX - RING_EMISSIVE_MIN) * pulse

  const mutableTransform = Transform.getMutable(entity)
  mutableTransform.position = Vector3.create(0, RING_HEIGHT + Math.sin(t * 9) * 0.006, 0)
  mutableTransform.rotation = Quaternion.fromEulerDegrees(0, (t * 180 * RING_ROTATION_SPEED) % 360, 0)
  mutableTransform.scale = Vector3.create(rootScale, 1, rootScale)

  for (let i = 0; i < ringSegments.length; i++) {
    const segment = ringSegments[i]
    if (!Transform.has(segment)) continue

    const angle = (i / RING_SEGMENT_COUNT) * Math.PI * 2
    const wobble = Math.sin(t * 8 + i * 0.9)
    const radialScale = 0.92 + 0.12 * pulse
    const segmentTransform = Transform.getMutable(segment)
    segmentTransform.position = Vector3.create(
      Math.cos(angle) * RING_RADIUS * radialScale,
      wobble * RING_BOB_HEIGHT,
      Math.sin(angle) * RING_RADIUS * radialScale
    )
    segmentTransform.rotation = Quaternion.fromEulerDegrees(0, (-angle * 180) / Math.PI, 0)
    segmentTransform.scale = Vector3.create(
      RING_SEGMENT_WIDTH * (0.96 + pulse * 0.12),
      RING_SEGMENT_THICKNESS,
      RING_SEGMENT_DEPTH * (0.9 + (1 - pulse) * 0.18)
    )

    Material.setPbrMaterial(segment, {
      albedoColor: Color4.create(0.5 + pulse * 0.16, 0.04, 0.04, 0.98),
      emissiveColor: Color3.create(1, 0.16 + pulse * 0.08, 0.06),
      emissiveIntensity: emissive + (i % 2 === 0 ? 0.15 : 0),
      metallic: 0,
      roughness: 0.95
    })
  }
}

export function initRageAura(): void {
  engine.addSystem(rageAuraSystem)
}
