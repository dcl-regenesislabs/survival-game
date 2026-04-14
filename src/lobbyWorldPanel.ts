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
import { RoomId, ROOM_IDS, getArenaRoomConfig } from './shared/roomConfig'

const PANEL_UPDATE_INTERVAL_SECONDS = 0.2
const LOBBY_REQUEST_COOLDOWN_MS = 1000
const COMING_SOON_ARENAS = [
  {
    triggerEntityName: EntityNames.trigger_room_3,
    newGameTextEntityName: EntityNames.NewGameText_glb_3,
    label: 'Arena #3 Coming Soon'
  },
  {
    triggerEntityName: EntityNames.trigger_room_4,
    newGameTextEntityName: EntityNames.NewGameText_glb_4,
    label: 'Arena #4 Coming Soon'
  }
] as const

type Entity = ReturnType<typeof engine.addEntity>

function requireSceneEntity(entityName: EntityNames): Entity {
  for (const [entity, name] of engine.getEntitiesWith(Name)) {
    if (name.value === entityName) return entity
  }

  throw new Error(`[LobbyPanel] Scene entity not found: ${entityName}`)
}

function createLobbyTitleText(entity: Entity, text: string, baseX: number, baseY: number, baseZ: number): void {
  Transform.create(entity, {
    position: Vector3.create(baseX, baseY + 5.6, baseZ + 3.5),
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

export class LobbyWorldPanel {
  private readonly roomId: RoomId
  private readonly textEntity = engine.addEntity()
  private readonly countdownTextEntity = engine.addEntity()
  private readonly triggerEntity: Entity
  private readonly newGameTextEntity: Entity
  private readonly newGameTextVisibleScale: Vector3
  private updateAccumulator = 0
  private lastRenderedPlayersText = ''
  private lastRenderedCountdownText = ''
  private isLocalPlayerInsideTrigger = false
  private lastJoinRequestAtMs = 0
  private lastLeaveRequestAtMs = 0

  constructor(roomId: RoomId) {
    this.roomId = roomId
    const roomConfig = getArenaRoomConfig(roomId)
    this.triggerEntity = requireSceneEntity(roomConfig.triggerEntityName)
    this.newGameTextEntity = requireSceneEntity(roomConfig.newGameTextEntityName)
    const newGameTransform = Transform.getOrNull(this.newGameTextEntity)
    this.newGameTextVisibleScale = newGameTransform
      ? Vector3.create(newGameTransform.scale.x, newGameTransform.scale.y, newGameTransform.scale.z)
      : Vector3.create(1, 1, 1)
    this.createPanel()
    engine.addSystem((dt) => this.updateSystem(dt), undefined, `lobby-world-panel-system-${roomId}`)
  }

  private createPanel(): void {
    // Derive text positions from the trigger entity's world position so both
    // room panels always appear at the correct location regardless of layout.
    const triggerTransform = Transform.getOrNull(this.triggerEntity)
    const baseX = triggerTransform?.position.x ?? 0
    const baseY = triggerTransform?.position.y ?? 0
    const baseZ = triggerTransform?.position.z ?? 0

    createLobbyTitleText(this.textEntity, 'Players Joined: 0/5', baseX, baseY, baseZ)

    Transform.create(this.countdownTextEntity, {
      position: Vector3.create(baseX, baseY + 4.5, baseZ),
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
    const lobby = getLobbyState(this.roomId)
    const isAlreadyJoined = !!localAddress && !!lobby?.players.find((player) => player.address === localAddress)
    if (isAlreadyJoined) return

    const nowMs = Date.now()
    if (nowMs - this.lastJoinRequestAtMs < LOBBY_REQUEST_COOLDOWN_MS) return
    this.lastJoinRequestAtMs = nowMs
    sendCreateMatchAndJoin(this.roomId)
  }

  private requestLobbyLeaveIfNeeded(): void {
    const localAddress = getLocalAddress()
    const lobby = getLobbyState(this.roomId)
    const isAlreadyJoined = !!localAddress && !!lobby?.players.find((player) => player.address === localAddress)
    if (!isAlreadyJoined) return
    if (this.shouldIgnoreTriggerExitLeave()) return

    const nowMs = Date.now()
    if (nowMs - this.lastLeaveRequestAtMs < LOBBY_REQUEST_COOLDOWN_MS) return
    this.lastLeaveRequestAtMs = nowMs
    sendLeaveLobby(this.roomId)
  }

  private shouldIgnoreTriggerExitLeave(): boolean {
    if (isLocalReadyForMatch()) return true

    return this.isMatchInProgress()
  }

  private isMatchInProgress(): boolean {
    const matchRuntime = getMatchRuntimeState(this.roomId)
    if (matchRuntime?.isRunning) return true

    const lobby = getLobbyState(this.roomId)
    return !!(lobby?.arenaIntroEndTimeMs && lobby.arenaIntroEndTimeMs > getServerTime())
  }

  private buildPlayersText(): string {
    if (this.isMatchInProgress()) return 'Game In Progress'

    const lobby = getLobbyState(this.roomId)
    const joinedCount = lobby?.players.length ?? 0
    return `Players Joined: ${joinedCount}/${MATCH_MAX_PLAYERS}`
  }

  private buildCountdownText(): string {
    return ''
  }

  private syncNewGameTextVisibility(): void {
    const nextScale = this.isMatchInProgress() ? Vector3.Zero() : this.newGameTextVisibleScale
    Transform.getMutable(this.newGameTextEntity).scale = nextScale
  }

  private updateSystem(dt: number): void {
    this.updateAccumulator += dt
    if (this.updateAccumulator < PANEL_UPDATE_INTERVAL_SECONDS) return
    this.updateAccumulator = 0

    this.syncNewGameTextVisibility()

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

class ComingSoonArenaPanel {
  private readonly textEntity = engine.addEntity()

  constructor(
    private readonly triggerEntityName: EntityNames,
    private readonly newGameTextEntityName: EntityNames,
    private readonly label: string
  ) {
    this.createPanel()
  }

  private createPanel(): void {
    const triggerEntity = requireSceneEntity(this.triggerEntityName)
    const triggerTransform = Transform.getOrNull(triggerEntity)
    const baseX = triggerTransform?.position.x ?? 0
    const baseY = triggerTransform?.position.y ?? 0
    const baseZ = triggerTransform?.position.z ?? 0

    createLobbyTitleText(this.textEntity, this.label, baseX, baseY, baseZ)
    Transform.getMutable(requireSceneEntity(this.newGameTextEntityName)).scale = Vector3.Zero()
  }
}

export function initLobbyWorldPanel(): LobbyWorldPanel[] {
  COMING_SOON_ARENAS.forEach((arena) => {
    new ComingSoonArenaPanel(arena.triggerEntityName, arena.newGameTextEntityName, arena.label)
  })
  return ROOM_IDS.map((roomId) => new LobbyWorldPanel(roomId))
}
