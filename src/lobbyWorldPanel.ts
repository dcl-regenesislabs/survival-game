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
import {
  getLobbyState,
  getLocalAddress,
  getMatchRuntimeState,
  isLocalReadyForMatch,
  sendCreateMatchAndJoin,
  sendLeaveLobby
} from './multiplayer/lobbyClient'
import { getServerTime } from './shared/timeSync'

const PANEL_WORLD_POSITION = Vector3.create(76.2, 3, 36)
const ROOT_ROTATION = Quaternion.fromEulerDegrees(0, -90, 0)
const PANEL_WORLD_SCALE = Vector3.create(6.4, 3.8, 0.2)
const PANEL_UPDATE_INTERVAL_SECONDS = 0.2
const TRIGGER_RECONCILE_INTERVAL_SECONDS = 0.1
const TEXT_LOCAL_POSITION = Vector3.create(0, 0.82, 0.3)
const COUNTDOWN_TEXT_LOCAL_POSITION = Vector3.create(0, -0.25, -0.25)
const TRIGGER_LOCAL_POSITION = Vector3.create(0, -3, -2.2)
const TRIGGER_SCALE = Vector3.create(5.4, 2.6, 4.6)
const TRIGGER_HALF_EXTENTS = Vector3.create(TRIGGER_SCALE.x * 0.5, TRIGGER_SCALE.y * 0.5, TRIGGER_SCALE.z * 0.5)
const TRIGGER_BOUNDS_EPSILON = 0.15
const TRIGGER_SHADOW_SCALE_VISIBLE = Vector3.create(1.9, 0.06, 1.9)
const TRIGGER_SHADOW_HIDDEN_POSITION = Vector3.create(0, -1000, 0)
const ROOT_INVERSE_ROTATION = Quaternion.fromEulerDegrees(0, 90, 0)
const LOBBY_REQUEST_COOLDOWN_MS = 1000
const TRIGGER_SHADOW_SYNC_COMPONENT_IDS = [
  Transform.componentId,
  MeshRenderer.componentId,
  Material.componentId
]

export class LobbyWorldPanel {
  private rootEntity = engine.addEntity()
  private panelEntity = engine.addEntity()
  private textEntity = engine.addEntity()
  private countdownTextEntity = engine.addEntity()
  private triggerEntity = engine.addEntity()
  private triggerShadowEntity = engine.addEntity()
  private updateAccumulator = 0
  private triggerReconcileAccumulator = 0
  private lastRenderedPlayersText = ''
  private lastRenderedCountdownText = ''
  private isLocalPlayerInsideTrigger = false
  private lastJoinRequestAtMs = 0
  private lastLeaveRequestAtMs = 0

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
      fontSize: 8.3,
      fontAutoSize: false,
      lineCount: 1,
      textWrapping: false,
      textAlign: TextAlignMode.TAM_TOP_CENTER,
      textColor: Color4.create(0.98, 0.9, 0.62, 1),
      paddingTop: 0.12,
      paddingRight: 0.18,
      paddingBottom: 0.12,
      paddingLeft: 0.18,
      shadowColor: Color3.create(0, 0, 0),
      shadowOffsetX: 0.05,
      shadowOffsetY: -0.05
    })

    Transform.create(this.countdownTextEntity, {
      parent: this.rootEntity,
      position: COUNTDOWN_TEXT_LOCAL_POSITION,
      rotation: Quaternion.Identity(),
      scale: Vector3.create(0.22, 0.22, 0.22)
    })
    TextShape.create(this.countdownTextEntity, {
      text: '',
      width: 4.5,
      height: 2.5,
      fontSize: 16,
      fontAutoSize: false,
      lineCount: 1,
      textWrapping: false,
      textAlign: TextAlignMode.TAM_MIDDLE_CENTER,
      textColor: Color4.create(1, 0.86, 0.18, 1),
      outlineWidth: 0.26,
      outlineColor: Color3.create(0, 0, 0)
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
      this.requestLobbyJoinIfNeeded()
    })
    triggerAreaEventsSystem.onTriggerExit(this.triggerEntity, (result) => {
      if (result.trigger?.entity !== engine.PlayerEntity) return
      console.log('[LobbyPanel] Player exited trigger area')
      this.isLocalPlayerInsideTrigger = false
      this.requestLobbyLeaveIfNeeded()
    })
  }

  private requestLobbyJoinIfNeeded(): void {
    const localAddress = getLocalAddress()
    const lobby = getLobbyState()
    const isAlreadyJoined = !!localAddress && !!lobby?.players.find((player) => player.address === localAddress)
    if (isAlreadyJoined) return

    const nowMs = Date.now()
    if (nowMs - this.lastJoinRequestAtMs < LOBBY_REQUEST_COOLDOWN_MS) return
    this.lastJoinRequestAtMs = nowMs
    sendCreateMatchAndJoin()
  }

  private requestLobbyLeaveIfNeeded(): void {
    const localAddress = getLocalAddress()
    const lobby = getLobbyState()
    const isAlreadyJoined = !!localAddress && !!lobby?.players.find((player) => player.address === localAddress)
    if (!isAlreadyJoined) return
    if (this.shouldIgnoreTriggerExitLeave()) return

    const nowMs = Date.now()
    if (nowMs - this.lastLeaveRequestAtMs < LOBBY_REQUEST_COOLDOWN_MS) return
    this.lastLeaveRequestAtMs = nowMs
    sendLeaveLobby()
  }

  private shouldIgnoreTriggerExitLeave(): boolean {
    if (isLocalReadyForMatch()) return true

    const matchRuntime = getMatchRuntimeState()
    if (matchRuntime?.isRunning) return true

    const lobby = getLobbyState()
    return !!(lobby?.arenaIntroEndTimeMs && lobby.arenaIntroEndTimeMs > getServerTime())
  }

  private createSyncedTriggerShadow(): void {
    Transform.create(this.triggerShadowEntity, {
      position: TRIGGER_SHADOW_HIDDEN_POSITION,
      rotation: Quaternion.Identity(),
      scale: Vector3.Zero()
    })
    MeshRenderer.setSphere(this.triggerShadowEntity)
    Material.setPbrMaterial(this.triggerShadowEntity, {
      albedoColor: Color4.create(0.04, 0.32, 0.1, 0.72),
      emissiveColor: Color3.create(0.02, 0.12, 0.04),
      emissiveIntensity: 0.08,
      metallic: 0,
      roughness: 1
    })
    syncEntity(this.triggerShadowEntity, TRIGGER_SHADOW_SYNC_COMPONENT_IDS)
  }

  private buildPlayersText(): string {
    const lobby = getLobbyState()
    const joinedCount = lobby?.players.length ?? 0
    return `Players Joined: ${joinedCount}/${MATCH_MAX_PLAYERS}`
  }

  private buildCountdownText(): string {
    const lobby = getLobbyState()
    if (lobby?.countdownEndTimeMs && lobby.countdownEndTimeMs > 0) {
      return `${Math.max(0, Math.ceil((lobby.countdownEndTimeMs - getServerTime()) / 1000))}`
    }
    return ''
  }

  private updateSystem(dt: number): void {
    this.reconcileLocalTriggerState(dt)
    this.updateTriggerShadow()

    this.updateAccumulator += dt
    if (this.updateAccumulator < PANEL_UPDATE_INTERVAL_SECONDS) return
    this.updateAccumulator = 0

    const nextPlayersText = this.buildPlayersText()
    if (nextPlayersText !== this.lastRenderedPlayersText) {
      this.lastRenderedPlayersText = nextPlayersText
      TextShape.getMutable(this.textEntity).text = nextPlayersText
    }

    const nextCountdownText = this.buildCountdownText()
    if (nextCountdownText !== this.lastRenderedCountdownText) {
      this.lastRenderedCountdownText = nextCountdownText
      TextShape.getMutable(this.countdownTextEntity).text = nextCountdownText
    }
  }

  private reconcileLocalTriggerState(dt: number): void {
    this.triggerReconcileAccumulator += dt
    if (this.triggerReconcileAccumulator < TRIGGER_RECONCILE_INTERVAL_SECONDS) return
    this.triggerReconcileAccumulator = 0

    const isActuallyInside = this.isPlayerInsideLobbyTriggerVolume()
    if (isActuallyInside === this.isLocalPlayerInsideTrigger) return

    this.isLocalPlayerInsideTrigger = isActuallyInside
    if (isActuallyInside) {
      console.log('[LobbyPanel] Reconciled player inside trigger area')
      this.requestLobbyJoinIfNeeded()
      return
    }

    console.log('[LobbyPanel] Reconciled player outside trigger area')
    this.requestLobbyLeaveIfNeeded()
  }

  private isPlayerInsideLobbyTriggerVolume(): boolean {
    if (!Transform.has(engine.PlayerEntity)) return false

    const triggerCenter = Vector3.add(PANEL_WORLD_POSITION, Vector3.rotate(TRIGGER_LOCAL_POSITION, ROOT_ROTATION))
    const playerPosition = Transform.get(engine.PlayerEntity).position
    const offsetFromCenter = Vector3.subtract(playerPosition, triggerCenter)
    const localOffset = Vector3.rotate(offsetFromCenter, ROOT_INVERSE_ROTATION)

    return (
      Math.abs(localOffset.x) <= TRIGGER_HALF_EXTENTS.x + TRIGGER_BOUNDS_EPSILON &&
      Math.abs(localOffset.y) <= TRIGGER_HALF_EXTENTS.y + TRIGGER_BOUNDS_EPSILON &&
      Math.abs(localOffset.z) <= TRIGGER_HALF_EXTENTS.z + TRIGGER_BOUNDS_EPSILON
    )
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
