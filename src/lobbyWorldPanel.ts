import {
  engine,
  TextAlignMode,
  Transform,
  MeshRenderer,
  Material,
  TextShape,
  TriggerArea,
  triggerAreaEventsSystem
} from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { Color4, Color3, Vector3, Quaternion } from '@dcl/sdk/math'
import { MATCH_MAX_PLAYERS } from './shared/matchConfig'
import { getLobbyState, getLocalAddress, sendCreateMatchAndJoin } from './multiplayer/lobbyClient'

const PANEL_WORLD_POSITION = Vector3.create(76.2, 3, 36)
const ROOT_ROTATION = Quaternion.fromEulerDegrees(0, -90, 0)
const PANEL_WORLD_SCALE = Vector3.create(6.4, 3.8, 0.2)
const PANEL_UPDATE_INTERVAL_SECONDS = 0.2
const TEXT_LOCAL_POSITION = Vector3.create(-1.85, 0.35, -0.25)
const TRIGGER_LOCAL_POSITION = Vector3.create(0, -3, -2.2)
const TRIGGER_SCALE = Vector3.create(5.4, 2.6, 4.6)
const TRIGGER_SHADOW_SCALE_VISIBLE = Vector3.create(1.9, 0.06, 1.9)
const TRIGGER_SHADOW_HIDDEN_POSITION = Vector3.create(0, -1000, 0)
const TRIGGER_SHADOW_SYNC_COMPONENT_IDS = [
  Transform.componentId,
  MeshRenderer.componentId,
  Material.componentId
]

export class LobbyWorldPanel {
  private rootEntity = engine.addEntity()
  private panelEntity = engine.addEntity()
  private textEntity = engine.addEntity()
  private triggerEntity = engine.addEntity()
  private triggerShadowEntity = engine.addEntity()
  private updateAccumulator = 0
  private lastRenderedText = ''
  private isLocalPlayerInsideTrigger = false

  constructor() {
    this.createPanel()
    this.createSyncedTriggerShadow()
    engine.addSystem((dt) => this.updateSystem(dt), undefined, 'lobby-world-panel-system')
  }

  private createPanel(): void {
    Transform.create(this.rootEntity, {
      position: PANEL_WORLD_POSITION,
      rotation: ROOT_ROTATION,
      scale: Vector3.One()
    })

    Transform.create(this.panelEntity, {
      parent: this.rootEntity,
      position: Vector3.Zero(),
      rotation: Quaternion.Identity(),
      scale: PANEL_WORLD_SCALE
    })
    MeshRenderer.setBox(this.panelEntity)
    Material.setPbrMaterial(this.panelEntity, {
      albedoColor: Color4.create(0.04, 0.09, 0.16, 1),
      emissiveColor: Color3.create(0.05, 0.12, 0.2),
      emissiveIntensity: 0.2,
      metallic: 0,
      roughness: 0.9
    })

    Transform.create(this.textEntity, {
      parent: this.rootEntity,
      position: TEXT_LOCAL_POSITION,
      rotation: Quaternion.Identity(),
      scale: Vector3.create(0.3, 0.3, 0.3)
    })
    TextShape.create(this.textEntity, {
      text: 'Players Joined: 0/5',
      width: 6.0,
      height: 2.4,
      fontSize: 6,
      fontAutoSize: false,
      lineCount: 3,
      textWrapping: true,
      textAlign: TextAlignMode.TAM_TOP_LEFT,
      textColor: Color4.create(0.9, 0.95, 1, 1),
      paddingTop: 0.12,
      paddingRight: 0.12,
      paddingBottom: 0.12,
      paddingLeft: 0.26,
      shadowColor: Color3.create(0, 0, 0),
      shadowOffsetX: 0.05,
      shadowOffsetY: -0.05
    })

    Transform.create(this.triggerEntity, {
      parent: this.rootEntity,
      position: TRIGGER_LOCAL_POSITION,
      rotation: Quaternion.Identity(),
      scale: TRIGGER_SCALE
    })
    TriggerArea.setBox(this.triggerEntity)
    triggerAreaEventsSystem.onTriggerEnter(this.triggerEntity, (result) => {
      if (result.trigger?.entity !== engine.PlayerEntity) return
      console.log('[LobbyPanel] Player entered trigger area')
      this.isLocalPlayerInsideTrigger = true

      const localAddress = getLocalAddress()
      const lobby = getLobbyState()
      const isAlreadyJoined = !!localAddress && !!lobby?.players.find((player) => player.address === localAddress)
      if (!isAlreadyJoined) {
        sendCreateMatchAndJoin()
      }
    })
    triggerAreaEventsSystem.onTriggerExit(this.triggerEntity, (result) => {
      if (result.trigger?.entity !== engine.PlayerEntity) return
      console.log('[LobbyPanel] Player exited trigger area')
      this.isLocalPlayerInsideTrigger = false
    })
  }

  private createSyncedTriggerShadow(): void {
    Transform.create(this.triggerShadowEntity, {
      position: TRIGGER_SHADOW_HIDDEN_POSITION,
      rotation: Quaternion.Identity(),
      scale: Vector3.Zero()
    })
    MeshRenderer.setSphere(this.triggerShadowEntity)
    Material.setPbrMaterial(this.triggerShadowEntity, {
      albedoColor: Color4.create(0.18, 0.95, 0.35, 0.45),
      emissiveColor: Color3.create(0.12, 0.85, 0.28),
      emissiveIntensity: 0.4,
      metallic: 0,
      roughness: 1
    })
    syncEntity(this.triggerShadowEntity, TRIGGER_SHADOW_SYNC_COMPONENT_IDS)
  }

  private buildStatusText(): string {
    const joinedCount = getLobbyState()?.players.length ?? 0
    return `Players Joined: ${joinedCount}/${MATCH_MAX_PLAYERS}`
  }

  private updateSystem(dt: number): void {
    this.updateTriggerShadow()

    this.updateAccumulator += dt
    if (this.updateAccumulator < PANEL_UPDATE_INTERVAL_SECONDS) return
    this.updateAccumulator = 0

    const nextText = this.buildStatusText()
    if (nextText === this.lastRenderedText) return

    this.lastRenderedText = nextText
    TextShape.getMutable(this.textEntity).text = nextText
  }

  private updateTriggerShadow(): void {
    const mutableShadowTransform = Transform.getMutable(this.triggerShadowEntity)
    if (!this.isLocalPlayerInsideTrigger || !Transform.has(engine.PlayerEntity)) {
      mutableShadowTransform.position = TRIGGER_SHADOW_HIDDEN_POSITION
      mutableShadowTransform.scale = Vector3.Zero()
      return
    }

    const playerPosition = Transform.get(engine.PlayerEntity).position
    mutableShadowTransform.position = Vector3.create(playerPosition.x, 0.05, playerPosition.z)
    mutableShadowTransform.scale = TRIGGER_SHADOW_SCALE_VISIBLE
  }
}

export function initLobbyWorldPanel(): LobbyWorldPanel {
  return new LobbyWorldPanel()
}
