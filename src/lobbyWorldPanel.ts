import {
  engine,
  TextAlignMode,
  Transform,
  TextShape,
  TriggerArea,
  triggerAreaEventsSystem
} from '@dcl/sdk/ecs'
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
import { openExternalUrl } from '~system/RestrictedActions'

const PANEL_WORLD_POSITION = Vector3.create(76.2, 3, 36)
const EXTERNAL_PANEL_WORLD_POSITIONS = [
  Vector3.create(78.2, 3, 29),
  Vector3.create(78.2, 3, 22)
] as const
const EXTERNAL_WORLD_LINKS = [
  {
    label: 'Play at /mendoexit.dcl.eth',
    url: 'https://decentraland.org/play/?NETWORK=mainnet&position=-141%2C-145&realm=mendoexit.dcl.eth'
  },
  {
    label: 'Play at /thecodingcave.dcl.eth',
    url: 'https://decentraland.org/play/?NETWORK=mainnet&position=-141%2C-145&realm=thecodingcave.dcl.eth'
  }
] as const
const ROOT_ROTATION = Quaternion.fromEulerDegrees(0, -90, 0)
const PANEL_WORLD_SCALE = Vector3.create(6.4, 3.8, 0.2)
const PANEL_UPDATE_INTERVAL_SECONDS = 0.2
const TRIGGER_RECONCILE_INTERVAL_SECONDS = 0.1
const TEXT_LOCAL_POSITION = Vector3.create(0, 0.82, 0.3)
const EXTERNAL_TEXT_LOCAL_POSITION = Vector3.create(0, 0.82, 1.8)
const COUNTDOWN_TEXT_LOCAL_POSITION = Vector3.create(0, -0.25, -0.25)
const TRIGGER_LOCAL_POSITION = Vector3.create(0, -3, -2.2)
const EXTERNAL_TRIGGER_LOCAL_POSITION = Vector3.create(0, -3, 1.8)
const TRIGGER_SCALE = Vector3.create(5.4, 2.6, 4.6)
const TRIGGER_HALF_EXTENTS = Vector3.create(TRIGGER_SCALE.x * 0.5, TRIGGER_SCALE.y * 0.5, TRIGGER_SCALE.z * 0.5)
const TRIGGER_BOUNDS_EPSILON = 0.15
const ROOT_INVERSE_ROTATION = Quaternion.fromEulerDegrees(0, 90, 0)
const LOBBY_REQUEST_COOLDOWN_MS = 1000
const EXTERNAL_LINK_COOLDOWN_MS = 1500

type Entity = ReturnType<typeof engine.addEntity>

class ExternalWorldPanel {
  private rootEntity: Entity = engine.addEntity()
  private textEntity: Entity = engine.addEntity()
  private triggerEntity: Entity = engine.addEntity()
  private isLocalPlayerInsideTrigger = false
  private triggerReconcileAccumulator = 0
  private lastOpenRequestAtMs = 0

  constructor(
    private readonly worldPosition: Vector3,
    private readonly label: string,
    private readonly url: string
  ) {
    this.createPanel()
    engine.addSystem((dt) => this.updateSystem(dt), undefined, `external-world-panel-${label}`)
  }

  private createPanel(): void {
    Transform.create(this.rootEntity, {
      position: this.worldPosition,
      rotation: ROOT_ROTATION,
      scale: Vector3.One()
    })

    Transform.create(this.textEntity, {
      parent: this.rootEntity,
      position: EXTERNAL_TEXT_LOCAL_POSITION,
      rotation: Quaternion.Identity(),
      scale: Vector3.create(0.3, 0.3, 0.3)
    })
    TextShape.create(this.textEntity, {
      text: this.label,
      width: 6.0,
      height: 2.4,
      fontSize: 8.3,
      fontAutoSize: false,
      lineCount: 1,
      textWrapping: false,
      textAlign: TextAlignMode.TAM_MIDDLE_CENTER,
      textColor: Color4.create(0.98, 0.9, 0.62, 1),
      paddingTop: 0.12,
      paddingRight: 0.18,
      paddingBottom: 0.12,
      paddingLeft: 0.18,
      shadowColor: Color3.create(0, 0, 0),
      shadowOffsetX: 0.05,
      shadowOffsetY: -0.05
    })

    Transform.create(this.triggerEntity, {
      parent: this.rootEntity,
      position: EXTERNAL_TRIGGER_LOCAL_POSITION,
      rotation: Quaternion.Identity(),
      scale: TRIGGER_SCALE
    })
    TriggerArea.setBox(this.triggerEntity)
    triggerAreaEventsSystem.onTriggerEnter(this.triggerEntity, (result) => {
      if (result.trigger?.entity !== engine.PlayerEntity) return
      this.isLocalPlayerInsideTrigger = true
      this.openWorldLinkIfNeeded()
    })
    triggerAreaEventsSystem.onTriggerExit(this.triggerEntity, (result) => {
      if (result.trigger?.entity !== engine.PlayerEntity) return
      this.isLocalPlayerInsideTrigger = false
    })
  }

  private updateSystem(dt: number): void {
    this.triggerReconcileAccumulator += dt
    if (this.triggerReconcileAccumulator < TRIGGER_RECONCILE_INTERVAL_SECONDS) return
    this.triggerReconcileAccumulator = 0

    const isActuallyInside = this.isPlayerInsideTriggerVolume()
    if (isActuallyInside === this.isLocalPlayerInsideTrigger) return

    this.isLocalPlayerInsideTrigger = isActuallyInside
    if (isActuallyInside) {
      this.openWorldLinkIfNeeded()
    }
  }

  private openWorldLinkIfNeeded(): void {
    const nowMs = Date.now()
    if (nowMs - this.lastOpenRequestAtMs < EXTERNAL_LINK_COOLDOWN_MS) return
    this.lastOpenRequestAtMs = nowMs
    void openExternalUrl({ url: this.url })
  }

  private isPlayerInsideTriggerVolume(): boolean {
    if (!Transform.has(engine.PlayerEntity)) return false

    const triggerCenter = Vector3.add(this.worldPosition, Vector3.rotate(EXTERNAL_TRIGGER_LOCAL_POSITION, ROOT_ROTATION))
    const playerPosition = Transform.get(engine.PlayerEntity).position
    const offsetFromCenter = Vector3.subtract(playerPosition, triggerCenter)
    const localOffset = Vector3.rotate(offsetFromCenter, ROOT_INVERSE_ROTATION)

    return (
      Math.abs(localOffset.x) <= TRIGGER_HALF_EXTENTS.x + TRIGGER_BOUNDS_EPSILON &&
      Math.abs(localOffset.y) <= TRIGGER_HALF_EXTENTS.y + TRIGGER_BOUNDS_EPSILON &&
      Math.abs(localOffset.z) <= TRIGGER_HALF_EXTENTS.z + TRIGGER_BOUNDS_EPSILON
    )
  }
}

export class LobbyWorldPanel {
  private rootEntity = engine.addEntity()
  private panelEntity = engine.addEntity()
  private textEntity = engine.addEntity()
  private countdownTextEntity = engine.addEntity()
  private triggerEntity = engine.addEntity()
  private updateAccumulator = 0
  private triggerReconcileAccumulator = 0
  private lastRenderedPlayersText = ''
  private lastRenderedCountdownText = ''
  private isLocalPlayerInsideTrigger = false
  private lastJoinRequestAtMs = 0
  private lastLeaveRequestAtMs = 0

  constructor() {
    this.createPanel()
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
}

export function initLobbyWorldPanel(): LobbyWorldPanel {
  EXTERNAL_WORLD_LINKS.forEach((panel, index) => {
    new ExternalWorldPanel(EXTERNAL_PANEL_WORLD_POSITIONS[index], panel.label, panel.url)
  })
  return new LobbyWorldPanel()
}
