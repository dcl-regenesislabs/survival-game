import {
  engine,
  Name,
  TextAlignMode,
  Transform,
  TextShape,
  TriggerArea,
  triggerAreaEventsSystem
} from '@dcl/sdk/ecs'
import { Color4, Color3, Vector3, Quaternion } from '@dcl/sdk/math'
import { EntityNames } from '../assets/scene/entity-names'
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

const PANEL_WORLD_SCALE = Vector3.create(6.4, 3.8, 0.2)
const PANEL_UPDATE_INTERVAL_SECONDS = 0.2
const JOIN_TEXT_WORLD_POSITION = Vector3.create(67.25, 5.6, 47.25)
const JOIN_COUNTDOWN_WORLD_POSITION = Vector3.create(67.25, 4.5, 43.75)
const LOBBY_REQUEST_COOLDOWN_MS = 1000

type Entity = ReturnType<typeof engine.addEntity>

export class LobbyWorldPanel {
  private rootEntity: Entity
  private panelEntity = engine.addEntity()
  private textEntity = engine.addEntity()
  private countdownTextEntity = engine.addEntity()
  private triggerEntity: Entity
  private updateAccumulator = 0
  private lastRenderedPlayersText = ''
  private lastRenderedCountdownText = ''
  private isLocalPlayerInsideTrigger = false
  private lastJoinRequestAtMs = 0
  private lastLeaveRequestAtMs = 0

  constructor() {
    this.rootEntity = this.requireSceneEntity(EntityNames.Lobby02_glb)
    this.triggerEntity = this.requireSceneEntity(EntityNames.trigger_room_1)
    this.createPanel()
    engine.addSystem((dt) => this.updateSystem(dt), undefined, 'lobby-world-panel-system')
  }

  private requireSceneEntity(entityName: EntityNames): Entity {
    for (const [entity, name] of engine.getEntitiesWith(Name)) {
      if (name.value === entityName) return entity
    }

    throw new Error(`[LobbyPanel] Scene entity not found: ${entityName}`)
  }

  private createPanel(): void {
    Transform.create(this.panelEntity, {
      parent: this.rootEntity,
      position: Vector3.Zero(),
      rotation: Quaternion.Identity(),
      scale: PANEL_WORLD_SCALE
    })

    Transform.create(this.textEntity, {
      position: JOIN_TEXT_WORLD_POSITION,
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
      position: JOIN_COUNTDOWN_WORLD_POSITION,
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
      textColor: Color4.create(1, 1, 1, 1),
      outlineWidth: 0.26,
      outlineColor: Color3.create(0, 0, 0)
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
    return ''
  }

  private updateSystem(dt: number): void {
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
}

export function initLobbyWorldPanel(): LobbyWorldPanel {
  return new LobbyWorldPanel()
}
