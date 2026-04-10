import { engine, Entity, Material, MeshCollider, MeshRenderer, Schemas, Transform, ColliderLayer } from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { room } from './shared/messages'
import { getServerTime } from './shared/timeSync'
import { getGameTime } from './zombie'
import { getLobbyState, getLocalAddress, isLocalReadyForMatch } from './multiplayer/lobbyClient'

const COLLECTIBLE_PICKUP_RADIUS = 1.8
const COLLECTIBLE_FLOAT_HEIGHT = 0.5   // base height above ground
const COLLECTIBLE_BOB_AMPLITUDE = 0.12 // how much it bobs up/down
const COLLECTIBLE_BOB_SPEED = 2.2      // radians per second
const COLLECTIBLE_SPIN_SPEED = 1.4     // radians per second (Y rotation)

const CollectibleComponent = engine.defineComponent('CollectibleComponent', {
  collectibleId: Schemas.String,
  expiresAtMs: Schemas.Int64,
  claimPending: Schemas.Boolean,
  baseX: Schemas.Number,
  baseZ: Schemas.Number,
  phase: Schemas.Number   // random phase offset for bob so not all in sync
})

const localCollectibleById = new Map<string, Entity>()
let isInitialized = false

function isLocalPlayerInCurrentMatch(): boolean {
  const lobbyState = getLobbyState()
  const localAddress = getLocalAddress()
  if (!lobbyState || !localAddress) return false
  if (lobbyState.phase !== 'match_created') return false
  if (!isLocalReadyForMatch()) return false
  return lobbyState.arenaPlayers.some((p) => p.address === localAddress)
}

function createCollectibleEntity(
  collectibleId: string,
  position: Vector3,
  expiresAtMs: number
): void {
  removeCollectibleById(collectibleId)

  const entity = engine.addEntity()
  Transform.create(entity, {
    position: Vector3.create(position.x, position.y + COLLECTIBLE_FLOAT_HEIGHT, position.z),
    scale: Vector3.create(0.35, 0.35, 0.35)
  })
  MeshRenderer.setSphere(entity)
  MeshCollider.setSphere(entity, ColliderLayer.CL_NONE)
  Material.setPbrMaterial(entity, {
    albedoColor: Color4.create(0.15, 0.9, 1.0, 0.9),
    emissiveColor: Color4.create(0.1, 0.6, 1.0, 1),
    emissiveIntensity: 1.8,
    roughness: 0.2,
    metallic: 0.6
  })

  CollectibleComponent.create(entity, {
    collectibleId,
    expiresAtMs,
    claimPending: false,
    baseX: position.x,
    baseZ: position.z,
    phase: Math.random() * Math.PI * 2
  })
  localCollectibleById.set(collectibleId, entity)
}

function removeCollectibleById(collectibleId: string): void {
  const entity = localCollectibleById.get(collectibleId)
  if (!entity) return
  if (CollectibleComponent.has(entity)) engine.removeEntity(entity)
  localCollectibleById.delete(collectibleId)
}

function clearAllCollectibles(): void {
  for (const id of [...localCollectibleById.keys()]) removeCollectibleById(id)
}

export function initCollectibleClient(): void {
  if (isInitialized) return
  isInitialized = true

  room.onMessage('collectibleSpawned', (data) => {
    if (!isLocalPlayerInCurrentMatch()) return
    createCollectibleEntity(
      data.collectibleId,
      Vector3.create(data.positionX, data.positionY, data.positionZ),
      data.expiresAtMs
    )
  })

  room.onMessage('collectibleClaimed', (data) => {
    removeCollectibleById(data.collectibleId)
    // TODO: apply effect to local player if data.claimerAddress === localAddress
  })

  room.onMessage('collectibleExpired', (data) => {
    removeCollectibleById(data.collectibleId)
  })

  room.onMessage('collectiblesCleared', () => {
    clearAllCollectibles()
  })

  room.onMessage('collectibleClaimRejected', (data: { collectibleId: string }) => {
    const entity = localCollectibleById.get(data.collectibleId)
    if (!entity || !CollectibleComponent.has(entity)) return
    CollectibleComponent.getMutable(entity).claimPending = false
  })
}

export function collectibleSystem(dt: number): void {
  if (!isLocalPlayerInCurrentMatch()) {
    clearAllCollectibles()
    return
  }

  const now = getServerTime()
  const gameTime = getGameTime()
  const playerPos = Transform.has(engine.PlayerEntity) ? Transform.get(engine.PlayerEntity).position : null
  const toRemove: string[] = []

  for (const [entity, col] of engine.getEntitiesWith(CollectibleComponent)) {
    if (now >= col.expiresAtMs) {
      toRemove.push(col.collectibleId)
      continue
    }

    // Bob + spin animation
    const bobY = col.baseX !== undefined
      ? COLLECTIBLE_FLOAT_HEIGHT + Math.sin(gameTime * COLLECTIBLE_BOB_SPEED + col.phase) * COLLECTIBLE_BOB_AMPLITUDE
      : COLLECTIBLE_FLOAT_HEIGHT
    const spinAngle = (gameTime * COLLECTIBLE_SPIN_SPEED) % (Math.PI * 2)
    const t = Transform.getMutable(entity)
    t.position = Vector3.create(col.baseX, bobY, col.baseZ)
    t.rotation = { x: 0, y: Math.sin(spinAngle / 2), z: 0, w: Math.cos(spinAngle / 2) }

    // Proximity pickup
    if (!playerPos || col.claimPending) continue
    const dx = playerPos.x - col.baseX
    const dz = playerPos.z - col.baseZ
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist > COLLECTIBLE_PICKUP_RADIUS) continue

    CollectibleComponent.getMutable(entity).claimPending = true
    void room.send('collectiblePickupRequest', { collectibleId: col.collectibleId })
  }

  for (const id of toRemove) removeCollectibleById(id)
}
