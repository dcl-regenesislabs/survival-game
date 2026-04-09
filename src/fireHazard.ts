import { engine, Entity, MeshRenderer, MeshCollider, Schemas, Transform } from '@dcl/sdk/ecs'
import { Color3, Vector3 } from '@dcl/sdk/math'
import { Material } from '@dcl/sdk/ecs'
import { room } from './shared/messages'
import { getLobbyState, getLocalAddress, isLocalReadyForMatch } from './multiplayer/lobbyClient'
import { LobbyPhase } from './shared/lobbySchemas'
import { getServerTime } from './shared/timeSync'

const FIRE_RADIUS = 1.2       // Units — how close the player must be to take damage
const FIRE_SCALE = 1.0        // Visual sphere size
const FIRE_DAMAGE_COOLDOWN_MS = 1000 // 1 damage per second while inside

const FireHazardComponent = engine.defineComponent('FireHazard', {
  fireId: Schemas.String,
  expiresAtMs: Schemas.Int64,
  lastDamageSentAtMs: Schemas.Int64
})

const localFireEntityById = new Map<string, Entity>()
let isFireSyncInitialized = false

function createFireEntity(fireId: string, position: Vector3, expiresAtMs: number): void {
  removeFireById(fireId)

  const entity = engine.addEntity()
  Transform.create(entity, {
    position: Vector3.create(position.x, position.y + FIRE_SCALE * 0.5, position.z),
    scale: Vector3.create(FIRE_SCALE, FIRE_SCALE, FIRE_SCALE)
  })
  MeshRenderer.setSphere(entity)
  MeshCollider.setSphere(entity)
  Material.setPbrMaterial(entity, {
    albedoColor: { r: 1, g: 0.3, b: 0, a: 0.85 },
    emissiveColor: Color3.create(1, 0.2, 0),
    emissiveIntensity: 2,
    metallic: 0,
    roughness: 1
  })
  FireHazardComponent.create(entity, {
    fireId,
    expiresAtMs,
    lastDamageSentAtMs: 0
  })
  localFireEntityById.set(fireId, entity)
}

function removeFireById(fireId: string): void {
  const entity = localFireEntityById.get(fireId)
  if (!entity) return
  localFireEntityById.delete(fireId)
  if (FireHazardComponent.has(entity)) engine.removeEntity(entity)
}

function clearAllFires(): void {
  for (const fireId of [...localFireEntityById.keys()]) {
    removeFireById(fireId)
  }
}

function isLocalPlayerInCurrentMatch(): boolean {
  const lobbyState = getLobbyState()
  const localAddress = getLocalAddress()
  if (!lobbyState || !localAddress) return false
  if (lobbyState.phase !== LobbyPhase.MATCH_CREATED) return false
  if (!isLocalReadyForMatch()) return false
  return lobbyState.arenaPlayers.some((player) => player.address === localAddress)
}

export function initFireHazardClient(): void {
  if (isFireSyncInitialized) return
  isFireSyncInitialized = true

  room.onMessage('fireHazardSpawned', (data) => {
    if (!isLocalPlayerInCurrentMatch()) return
    createFireEntity(
      data.fireId,
      Vector3.create(data.positionX, data.positionY, data.positionZ),
      data.expiresAtMs
    )
  })

  room.onMessage('fireHazardExpired', (data) => {
    removeFireById(data.fireId)
  })

  room.onMessage('fireHazardsCleared', () => {
    clearAllFires()
  })
}

export function fireHazardSystem(): void {
  if (!isLocalPlayerInCurrentMatch()) {
    clearAllFires()
    return
  }

  const now = getServerTime()
  const playerPos = Transform.has(engine.PlayerEntity)
    ? Transform.get(engine.PlayerEntity).position
    : null

  const toRemove: string[] = []

  for (const [entity, fire, transform] of engine.getEntitiesWith(FireHazardComponent, Transform)) {
    if (now >= fire.expiresAtMs) {
      toRemove.push(fire.fireId)
      continue
    }

    if (!playerPos) continue

    const dx = playerPos.x - transform.position.x
    const dz = playerPos.z - transform.position.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    if (dist > FIRE_RADIUS) continue
    if (now - fire.lastDamageSentAtMs < FIRE_DAMAGE_COOLDOWN_MS) continue

    FireHazardComponent.getMutable(entity).lastDamageSentAtMs = Math.floor(now)
    void room.send('fireHazardDamageRequest', { fireId: fire.fireId })
  }

  for (const fireId of toRemove) {
    removeFireById(fireId)
  }
}
