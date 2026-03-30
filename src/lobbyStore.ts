import {
  engine,
  Name,
  pointerEventsSystem,
  InputAction,
  MeshCollider,
  ColliderLayer,
  Transform
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { EntityNames } from '../assets/scene/entity-names'
import { openLobbyStore } from './lobbyStoreUi'

type Entity = ReturnType<typeof engine.addEntity>

const NPC_HOVER_TEXT = 'Open Store'
const NPC_MAX_DISTANCE = 5

// Invisible box centered on the NPC body (chest level)
const HITBOX_HEIGHT_OFFSET = 1.0  // meters above NPC origin
const HITBOX_SIZE = Vector3.create(1.0, 1.8, 0.6)

function findSceneEntity(entityName: EntityNames): Entity | undefined {
  for (const [entity, name] of engine.getEntitiesWith(Name)) {
    if (name.value === entityName) return entity
  }
  return undefined
}

function setupNpcClickHandler(npcEntity: Entity, npcName: string): void {
  // Create an invisible child entity as the click target at body height
  const hitbox = engine.addEntity()
  Transform.create(hitbox, {
    parent: npcEntity,
    position: Vector3.create(0, HITBOX_HEIGHT_OFFSET, 0),
    rotation: Quaternion.Identity(),
    scale: HITBOX_SIZE
  })
  MeshCollider.setBox(hitbox, ColliderLayer.CL_POINTER)

  pointerEventsSystem.onPointerDown(
    {
      entity: hitbox,
      opts: {
        button: InputAction.IA_POINTER,
        hoverText: NPC_HOVER_TEXT,
        maxDistance: NPC_MAX_DISTANCE
      }
    },
    () => {
      console.log(`[LobbyStore] NPC clicked: ${npcName}`)
      openLobbyStore()
    }
  )
}

export function initLobbyStore(): void {
  const npcNames: EntityNames[] = [EntityNames.npcs01_glb, EntityNames.npcs02_glb]
  const pending = new Set(npcNames)

  const systemName = 'lobby-store-npc-init-system'
  engine.addSystem(() => {
    for (const npcName of pending) {
      const entity = findSceneEntity(npcName)
      if (!entity) continue
      setupNpcClickHandler(entity, npcName)
      pending.delete(npcName)
      console.log(`[LobbyStore] Click handler registered on ${npcName}`)
    }
    if (pending.size === 0) {
      engine.removeSystem(systemName)
    }
  }, undefined, systemName)
}
