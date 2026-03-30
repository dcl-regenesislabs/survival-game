import {
  engine,
  Name,
  pointerEventsSystem,
  InputAction,
  GltfContainer,
  ColliderLayer,
  Animator
} from '@dcl/sdk/ecs'
import { EntityNames } from '../assets/scene/entity-names'
import { openLobbyStore } from './lobbyStoreUi'

type Entity = ReturnType<typeof engine.addEntity>

const NPC_HOVER_TEXT = 'Open Store'
const NPC_MAX_DISTANCE = 5

function findSceneEntity(entityName: EntityNames): Entity | undefined {
  for (const [entity, name] of engine.getEntitiesWith(Name)) {
    if (name.value === entityName) return entity
  }
  return undefined
}

function setupNpcClickHandler(npcEntity: Entity): void {
  if (GltfContainer.has(npcEntity)) {
    const gltf = GltfContainer.getMutable(npcEntity)
    gltf.visibleMeshesCollisionMask =
      (gltf.visibleMeshesCollisionMask ?? ColliderLayer.CL_PHYSICS) | ColliderLayer.CL_POINTER
  }

  Animator.createOrReplace(npcEntity, {
    states: [
      { clip: 'Idle',      playing: true,  loop: true,  speed: 1 },
      { clip: 'TalkAgree', playing: false, loop: false, speed: 1 }
    ]
  })

  pointerEventsSystem.onPointerDown(
    {
      entity: npcEntity,
      opts: {
        button: InputAction.IA_POINTER,
        hoverText: NPC_HOVER_TEXT,
        maxDistance: NPC_MAX_DISTANCE
      }
    },
    () => {
      Animator.stopAllAnimations(npcEntity)
      const anim = Animator.getMutable(npcEntity)
      const talk = anim.states.find((s) => s.clip === 'TalkAgree')
      if (talk) {
        talk.playing = true
        talk.shouldReset = true
      }
      openLobbyStore()
    }
  )
}

export function initLobbyStore(): void {
  const pending = new Set([EntityNames.npcs01_glb])

  const systemName = 'lobby-store-npc-init-system'
  engine.addSystem(() => {
    for (const npcName of pending) {
      const entity = findSceneEntity(npcName)
      if (!entity) continue
      setupNpcClickHandler(entity)
      pending.delete(npcName)
    }
    if (pending.size === 0) {
      engine.removeSystem(systemName)
    }
  }, undefined, systemName)
}
