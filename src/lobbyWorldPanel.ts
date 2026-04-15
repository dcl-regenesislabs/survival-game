import {
  engine,
  Animator,
  GltfContainer,
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
import { LobbyPhase } from './shared/lobbySchemas'
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
const COMING_SOON_ROOM_TEXTS = [
  { roomNumber: 2, position: Vector3.create(78.5, 5.6, 47.25) },
  { roomNumber: 3, position: Vector3.create(90, 5.6, 47.25) },
  { roomNumber: 4, position: Vector3.create(101.35, 5.6, 47.25) }
]
const LOBBY_REQUEST_COOLDOWN_MS = 1000
const NEW_GAME_TEXT_SRC = 'assets/scene/Models/NewGameText.glb'
const GAME_IN_PROGRESS_TEXT_SRC = 'assets/scene/Models/GameInProText.glb'
const NEW_GAME_TEXT_ANIMATION_CLIP = 'Text.001Action'
const GAME_IN_PROGRESS_TEXT_ANIMATION_CLIP = 'Text.008Action'
const ROOM_1_GAME_TEXT_ENTITY_NAME = EntityNames.NewGameText_glb
const HIDDEN_GAME_TEXT_ENTITY_NAMES = [
  EntityNames.NewGameText_glb_2,
  EntityNames.NewGameText_glb_3,
  EntityNames.NewGameText_glb_4
]

type Entity = ReturnType<typeof engine.addEntity>
type GameTextMode = 'new_game' | 'in_progress'

export class LobbyWorldPanel {
  private rootEntity: Entity
  private panelEntity = engine.addEntity()
  private textEntity = engine.addEntity()
  private countdownTextEntity = engine.addEntity()
  private comingSoonTextEntities = COMING_SOON_ROOM_TEXTS.map(() => engine.addEntity())
  private triggerEntity: Entity
  private room1GameTextEntity: Entity
  private hiddenGameTextEntities: Entity[]
  private updateAccumulator = 0
  private lastRenderedPlayersText = ''
  private lastRenderedCountdownText = ''
  private lastRenderedGameTextMode: GameTextMode | null = null
  private frozenPlayersText: string | null = null
  private hasFrozenPlayersTextThisMatch = false
  private isLocalPlayerInsideTrigger = false
  private lastJoinRequestAtMs = 0
  private lastLeaveRequestAtMs = 0

  constructor() {
    this.rootEntity = this.requireSceneEntity(EntityNames.Lobby02_glb)
    this.triggerEntity = this.requireSceneEntity(EntityNames.trigger_room_1)
    this.room1GameTextEntity = this.requireSceneEntity(ROOM_1_GAME_TEXT_ENTITY_NAME)
    this.hiddenGameTextEntities = HIDDEN_GAME_TEXT_ENTITY_NAMES.map((entityName) => this.requireSceneEntity(entityName))
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

    this.createFloatingRoomText(this.textEntity, 'Players Joined: 0/5', JOIN_TEXT_WORLD_POSITION)
    this.hideUnusedGameTextEntities()

    COMING_SOON_ROOM_TEXTS.forEach((roomText, index) => {
      this.createFloatingRoomText(
        this.comingSoonTextEntities[index],
        `Arena ${roomText.roomNumber} Coming Soon`,
        roomText.position
      )
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

  private createFloatingRoomText(entity: Entity, text: string, position: Vector3): void {
    Transform.create(entity, {
      position,
      rotation: Quaternion.Identity(),
      scale: Vector3.create(0.3, 0.3, 0.3)
    })
    TextShape.create(entity, {
      text,
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
  }

  private hideUnusedGameTextEntities(): void {
    for (const entity of this.hiddenGameTextEntities) {
      if (Transform.has(entity)) {
        Transform.getMutable(entity).scale = Vector3.Zero()
      }
    }
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
    if (this.shouldFreezePlayersText()) {
      this.hasFrozenPlayersTextThisMatch = true
      if (this.frozenPlayersText === null) {
        const joinedCount = lobby?.arenaPlayers.length || lobby?.players.length || 0
        this.frozenPlayersText = `Players Joined: ${joinedCount}/${MATCH_MAX_PLAYERS}`
      }
      return this.frozenPlayersText
    }

    if (this.shouldResetPlayersText()) {
      this.frozenPlayersText = null
      this.hasFrozenPlayersTextThisMatch = false
      return `Players Joined: 0/${MATCH_MAX_PLAYERS}`
    }

    this.frozenPlayersText = null
    if (lobby?.phase === LobbyPhase.LOBBY) {
      this.hasFrozenPlayersTextThisMatch = false
    }
    const joinedCount = lobby?.players.length ?? 0
    return `Players Joined: ${joinedCount}/${MATCH_MAX_PLAYERS}`
  }

  private buildCountdownText(): string {
    return ''
  }

  private shouldShowGameInProgressText(): boolean {
    return this.shouldFreezePlayersText()
  }

  private shouldResetPlayersText(): boolean {
    if (!this.hasFrozenPlayersTextThisMatch) return false

    const lobby = getLobbyState()
    if (!lobby) return true
    if (lobby.phase === LobbyPhase.LOBBY) return false

    const nowMs = getServerTime()
    const matchRuntime = getMatchRuntimeState()
    return (
      !matchRuntime?.isRunning &&
      lobby.countdownEndTimeMs <= nowMs &&
      lobby.arenaIntroEndTimeMs <= nowMs
    )
  }

  private shouldFreezePlayersText(): boolean {
    const lobby = getLobbyState()
    if (!lobby || lobby.phase !== LobbyPhase.MATCH_CREATED) return false

    const nowMs = getServerTime()
    const matchRuntime = getMatchRuntimeState()
    if (matchRuntime?.isRunning) return true
    if (lobby.arenaIntroEndTimeMs > nowMs) return true
    return false
  }

  private updateGameTextVisual(): void {
    const nextMode: GameTextMode = this.shouldShowGameInProgressText() ? 'in_progress' : 'new_game'
    if (nextMode === this.lastRenderedGameTextMode) return

    this.lastRenderedGameTextMode = nextMode
    const src = nextMode === 'in_progress' ? GAME_IN_PROGRESS_TEXT_SRC : NEW_GAME_TEXT_SRC
    const clip = nextMode === 'in_progress' ? GAME_IN_PROGRESS_TEXT_ANIMATION_CLIP : NEW_GAME_TEXT_ANIMATION_CLIP

    if (GltfContainer.has(this.room1GameTextEntity)) {
      GltfContainer.getMutable(this.room1GameTextEntity).src = src
    }
    Animator.createOrReplace(this.room1GameTextEntity, {
      states: [{ clip, playing: true, loop: true, speed: 1 }]
    })
  }

  private updateSystem(dt: number): void {
    this.updateAccumulator += dt
    if (this.updateAccumulator < PANEL_UPDATE_INTERVAL_SECONDS) return
    this.updateAccumulator = 0

    this.updateGameTextVisual()

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
