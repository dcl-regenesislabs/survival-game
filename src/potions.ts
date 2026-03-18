import { Animator, engine, Entity, GltfContainer, Schemas, Transform } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { room } from './shared/messages'
import { getPlayerHp, healPlayer, MAX_HP, setHealGlowEndTime } from './playerHealth'
import { applyRageEffect } from './rageEffect'
import { applySpeedEffect } from './speedEffect'
import { getGameTime } from './zombie'
import { getServerTime } from './shared/timeSync'
import { getLobbyState, getLocalAddress, isLocalReadyForMatch, sendPlayerHealRequest } from './multiplayer/lobbyClient'

const HEALTH_POTION_GLB = 'assets/scene/Models/pickups/PickUpHealth.glb'
const RAGE_POTION_GLB = 'assets/scene/Models/pickups/PickUpRage.glb'
const SPEED_POTION_GLB = 'assets/scene/Models/pickups/PickUpSpeed.glb'

const HEALTH_POTION_SCALE = 1
const RAGE_POTION_SCALE = 1
const SPEED_POTION_SCALE = 1
const PICKUP_RADIUS = 2
const HEALTH_POTION_ANIMATION = 'Key.002Action'
const RAGE_POTION_ANIMATION = 'Key.001Action'
const SPEED_POTION_ANIMATION = 'KeyAction'

type PotionType = 'health' | 'rage' | 'speed'

const PotionPickupSchema = {
  potionId: Schemas.String,
  potionType: Schemas.String,
  removeAtTime: Schemas.Int64,
  childEntity: Schemas.Entity,
  claimPending: Schemas.Boolean
}
const PotionPickupComponent = engine.defineComponent('PotionPickup', PotionPickupSchema)

let healthPickupFeedbackText = ''
let healthPickupFeedbackEndTime = 0
let isPotionSyncInitialized = false
const localPotionEntityById = new Map<string, Entity>()

export function getHealthPickupFeedback(now: number): string {
  if (now > healthPickupFeedbackEndTime) return ''
  return healthPickupFeedbackText
}

function getPotionGlb(potionType: PotionType): string {
  if (potionType === 'health') return HEALTH_POTION_GLB
  if (potionType === 'rage') return RAGE_POTION_GLB
  return SPEED_POTION_GLB
}

function getPotionScale(potionType: PotionType): number {
  if (potionType === 'health') return HEALTH_POTION_SCALE
  if (potionType === 'rage') return RAGE_POTION_SCALE
  return SPEED_POTION_SCALE
}

function getPotionAnimation(potionType: PotionType): string {
  if (potionType === 'health') return HEALTH_POTION_ANIMATION
  if (potionType === 'rage') return RAGE_POTION_ANIMATION
  return SPEED_POTION_ANIMATION
}

function createPotionEntity(potionId: string, potionType: PotionType, position: Vector3, removeAtTime: number): void {
  removePotionById(potionId)

  const root = engine.addEntity()
  const child = engine.addEntity()
  const scale = getPotionScale(potionType)

  Transform.create(root, {
    position: Vector3.create(position.x, position.y, position.z),
    rotation: Quaternion.Identity(),
    scale: Vector3.create(scale, scale, scale)
  })
  Transform.create(child, {
    parent: root,
    position: Vector3.Zero(),
    rotation: Quaternion.Identity(),
    scale: Vector3.One()
  })
  GltfContainer.create(child, {
    src: getPotionGlb(potionType),
    visibleMeshesCollisionMask: 0,
    invisibleMeshesCollisionMask: 0
  })
  Animator.create(child, {
    states: [{ clip: getPotionAnimation(potionType), playing: true, loop: true, speed: 1 }]
  })
  PotionPickupComponent.create(root, {
    potionId,
    potionType,
    removeAtTime,
    childEntity: child,
    claimPending: false
  })
  localPotionEntityById.set(potionId, root)
}

function removePotion(root: Entity, potion: { potionId: string; childEntity: Entity }): void {
  localPotionEntityById.delete(potion.potionId)
  engine.removeEntity(potion.childEntity)
  engine.removeEntity(root)
}

function removePotionById(potionId: string): void {
  const entity = localPotionEntityById.get(potionId)
  if (!entity || !PotionPickupComponent.has(entity)) return
  removePotion(entity, PotionPickupComponent.get(entity))
}

function clearAllPotions(): void {
  for (const potionId of [...localPotionEntityById.keys()]) {
    removePotionById(potionId)
  }
}

function applyLocalPotionEffect(potionType: PotionType, now: number): void {
  if (potionType === 'health') {
    const hpBefore = getPlayerHp()
    healPlayer(MAX_HP)
    sendPlayerHealRequest(MAX_HP)
    healthPickupFeedbackText = hpBefore >= MAX_HP ? 'Maximum Health' : '+100 Health'
    healthPickupFeedbackEndTime = now + 1.5
    setHealGlowEndTime(now + 1.5)
    return
  }

  if (potionType === 'speed') {
    applySpeedEffect(now)
    return
  }

  applyRageEffect(now)
}

function isLocalPlayerInCurrentMatch(): boolean {
  const lobbyState = getLobbyState()
  const localAddress = getLocalAddress()
  if (!lobbyState || !localAddress) return false
  if (lobbyState.phase !== 'match_created') return false
  if (!isLocalReadyForMatch()) return false
  return lobbyState.arenaPlayers.some((player) => player.address === localAddress)
}

export function initPotionSyncClient(): void {
  if (isPotionSyncInitialized) return
  isPotionSyncInitialized = true

  room.onMessage('potionSpawned', (data) => {
    if (!isLocalPlayerInCurrentMatch()) return
    if (data.potionType !== 'health' && data.potionType !== 'rage' && data.potionType !== 'speed') return
    createPotionEntity(
      data.potionId,
      data.potionType,
      Vector3.create(data.positionX, data.positionY, data.positionZ),
      data.expiresAtMs
    )
  })

  room.onMessage('potionClaimed', (data) => {
    const entity = localPotionEntityById.get(data.potionId)
    const localAddress = getLocalAddress()
    const now = getGameTime()

    if (entity && PotionPickupComponent.has(entity)) {
      const potion = PotionPickupComponent.get(entity)
      removePotion(entity, potion)
      if (
        localAddress &&
        data.claimerAddress.toLowerCase() === localAddress &&
        (potion.potionType === 'health' || potion.potionType === 'rage' || potion.potionType === 'speed')
      ) {
        applyLocalPotionEffect(potion.potionType, now)
      }
    }
  })

  room.onMessage('potionExpired', (data) => {
    removePotionById(data.potionId)
  })

  room.onMessage('potionClaimRejected', (data) => {
    const entity = localPotionEntityById.get(data.potionId)
    if (!entity || !PotionPickupComponent.has(entity)) return
    PotionPickupComponent.getMutable(entity).claimPending = false
  })

  room.onMessage('potionsCleared', () => {
    clearAllPotions()
  })
}

export function potionVisualSystem(): void {
  // Visual animation is handled by the GLB clip itself.
}

function distanceXZ(a: Vector3, b: Vector3): number {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dz * dz)
}

export function potionPickupSystem(): void {
  if (!isLocalPlayerInCurrentMatch()) {
    clearAllPotions()
    return
  }

  const now = getServerTime()
  const playerPos = Transform.has(engine.PlayerEntity) ? Transform.get(engine.PlayerEntity).position : null
  const toRemove: Entity[] = []

  for (const [entity, potion, transform] of engine.getEntitiesWith(PotionPickupComponent, Transform)) {
    if (now >= potion.removeAtTime) {
      toRemove.push(entity)
      continue
    }
    if (!playerPos || potion.claimPending) continue

    const dist = distanceXZ(playerPos, transform.position)
    if (dist > PICKUP_RADIUS) continue

    PotionPickupComponent.getMutable(entity).claimPending = true
    void room.send('potionClaimRequest', { potionId: potion.potionId })
  }

  for (const entity of toRemove) {
    if (!PotionPickupComponent.has(entity)) continue
    removePotion(entity, PotionPickupComponent.get(entity))
  }
}
