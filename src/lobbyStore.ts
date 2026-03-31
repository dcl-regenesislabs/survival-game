import {
  engine,
  Name,
  pointerEventsSystem,
  InputAction,
  GltfContainer,
  ColliderLayer
} from '@dcl/sdk/ecs'
import { EntityNames } from '../assets/scene/entity-names'
import { openLobbyStore } from './lobbyStoreUi'

type Entity = ReturnType<typeof engine.addEntity>
type LobbyNpcConfig = {
  npcName: EntityNames
  clickName: EntityNames
  hoverText?: string
  onClick?: () => void
}

const NPC_MAX_DISTANCE = 5
const LOBBY_NPC_CONFIGS: LobbyNpcConfig[] = [
  {
    npcName: EntityNames.npcs01_glb,
    clickName: EntityNames.npc_collider_1,
    hoverText: 'Open Store',
    onClick: openLobbyStore
  },
  {
    npcName: EntityNames.npcs02_glb,
    clickName: EntityNames.npc_collider_2
  }
]

function findSceneEntity(entityName: EntityNames): Entity | undefined {
  for (const [entity, name] of engine.getEntitiesWith(Name)) {
    if (name.value === entityName) return entity
  }
  return undefined
}

function enablePointerCollision(entity: Entity): void {
  if (!GltfContainer.has(entity)) return

  const gltf = GltfContainer.getMutable(entity)
  gltf.visibleMeshesCollisionMask =
    (gltf.visibleMeshesCollisionMask ?? ColliderLayer.CL_PHYSICS) | ColliderLayer.CL_POINTER
}

function setupNpcClickHandler(config: LobbyNpcConfig, npcEntity: Entity, clickEntity: Entity): void {
  enablePointerCollision(npcEntity)
  enablePointerCollision(clickEntity)

  pointerEventsSystem.onPointerDown(
    {
      entity: clickEntity,
      opts: {
        button: InputAction.IA_POINTER,
        maxDistance: NPC_MAX_DISTANCE,
        ...(config.hoverText ? { hoverText: config.hoverText } : {})
      }
    },
    () => {
      config.onClick?.()
    }
  )
}

export function initLobbyStore(): void {
  const pending = new Set(LOBBY_NPC_CONFIGS.map((config) => config.npcName))
  const systemName = 'lobby-store-npc-init-system'
  engine.addSystem(() => {
    for (const config of LOBBY_NPC_CONFIGS) {
      if (!pending.has(config.npcName)) continue

      const npcEntity = findSceneEntity(config.npcName)
      const clickEntity = findSceneEntity(config.clickName)
      if (!npcEntity || !clickEntity) continue

      setupNpcClickHandler(config, npcEntity, clickEntity)
      pending.delete(config.npcName)
    }

    if (pending.size === 0) {
      engine.removeSystem(systemName)
    }
  }, undefined, systemName)
}
