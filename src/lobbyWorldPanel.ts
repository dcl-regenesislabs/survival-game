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
const ROOT_INVERSE_ROTATION = Quaternion.fromEulerDegrees(0, 90, 0)
const LOBBY_REQUEST_COOLDOWN_MS = 1000

type LobbyLeaveDebugState = {
  localAddress: string | null
  isAlreadyJoined: boolean
  ignoreBecauseReadyForMatch: boolean
  ignoreBecauseMatchRunning: boolean
  ignoreBecauseArenaIntro: boolean
  shouldIgnoreTriggerExitLeave: boolean
  cooldownActive: boolean
  cooldownRemainingMs: number
  lastOutcome: 'idle' | 'blocked:not_joined' | 'blocked:ignore_trigger_exit' | 'blocked:cooldown' | 'sent'
  traceLines: string[]
}

const lobbyLeaveDebugState: LobbyLeaveDebugState = {
  localAddress: null,
  isAlreadyJoined: false,
  ignoreBecauseReadyForMatch: false,
  ignoreBecauseMatchRunning: false,
  ignoreBecauseArenaIntro: false,
  shouldIgnoreTriggerExitLeave: false,
  cooldownActive: false,
  cooldownRemainingMs: 0,
  lastOutcome: 'idle',
  traceLines: []
}

const MAX_LEAVE_TRACE_LINES = 10

function pushLobbyLeaveTrace(message: string): void {
  const timestamp = new Date().toISOString().slice(11, 23)
  lobbyLeaveDebugState.traceLines.push(`${timestamp} ${message}`)
  if (lobbyLeaveDebugState.traceLines.length > MAX_LEAVE_TRACE_LINES) {
    lobbyLeaveDebugState.traceLines.shift()
  }
}

export function getLobbyLeaveDebugState(): LobbyLeaveDebugState {
  return lobbyLeaveDebugState
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
    pushLobbyLeaveTrace('requestLobbyLeaveIfNeeded() start')
    const localAddress = getLocalAddress()
    const lobby = getLobbyState()
    const matchRuntime = getMatchRuntimeState()
    const isAlreadyJoined = !!localAddress && !!lobby?.players.find((player) => player.address === localAddress)
    const nowMs = Date.now()
    const ignoreBecauseReadyForMatch = isLocalReadyForMatch()
    const ignoreBecauseMatchRunning = !!matchRuntime?.isRunning
    const ignoreBecauseArenaIntro = !!(lobby?.arenaIntroEndTimeMs && lobby.arenaIntroEndTimeMs > getServerTime())
    const shouldIgnoreTriggerExitLeave =
      ignoreBecauseReadyForMatch || ignoreBecauseMatchRunning || ignoreBecauseArenaIntro
    const cooldownRemainingMs = Math.max(0, LOBBY_REQUEST_COOLDOWN_MS - (nowMs - this.lastLeaveRequestAtMs))
    const cooldownActive = cooldownRemainingMs > 0

    lobbyLeaveDebugState.localAddress = localAddress
    lobbyLeaveDebugState.isAlreadyJoined = isAlreadyJoined
    lobbyLeaveDebugState.ignoreBecauseReadyForMatch = ignoreBecauseReadyForMatch
    lobbyLeaveDebugState.ignoreBecauseMatchRunning = ignoreBecauseMatchRunning
    lobbyLeaveDebugState.ignoreBecauseArenaIntro = ignoreBecauseArenaIntro
    lobbyLeaveDebugState.shouldIgnoreTriggerExitLeave = shouldIgnoreTriggerExitLeave
    lobbyLeaveDebugState.cooldownActive = cooldownActive
    lobbyLeaveDebugState.cooldownRemainingMs = cooldownRemainingMs

    pushLobbyLeaveTrace(`localAddress=${localAddress ?? 'undefined'}`)
    pushLobbyLeaveTrace(`isAlreadyJoined=${isAlreadyJoined}`)

    if (!isAlreadyJoined) {
      lobbyLeaveDebugState.lastOutcome = 'blocked:not_joined'
      pushLobbyLeaveTrace('return: !isAlreadyJoined')
      return
    }
    pushLobbyLeaveTrace(`ignore.readyForMatch=${ignoreBecauseReadyForMatch}`)
    pushLobbyLeaveTrace(`ignore.matchRunning=${ignoreBecauseMatchRunning}`)
    pushLobbyLeaveTrace(`ignore.arenaIntro=${ignoreBecauseArenaIntro}`)
    pushLobbyLeaveTrace(`shouldIgnoreTriggerExitLeave=${shouldIgnoreTriggerExitLeave}`)
    if (shouldIgnoreTriggerExitLeave) {
      lobbyLeaveDebugState.lastOutcome = 'blocked:ignore_trigger_exit'
      pushLobbyLeaveTrace('return: shouldIgnoreTriggerExitLeave()')
      return
    }
    pushLobbyLeaveTrace(`cooldownRemainingMs=${cooldownRemainingMs}`)
    if (cooldownActive) {
      lobbyLeaveDebugState.lastOutcome = 'blocked:cooldown'
      pushLobbyLeaveTrace('return: cooldown active')
      return
    }

    this.lastLeaveRequestAtMs = nowMs
    lobbyLeaveDebugState.cooldownActive = true
    lobbyLeaveDebugState.cooldownRemainingMs = LOBBY_REQUEST_COOLDOWN_MS
    lobbyLeaveDebugState.lastOutcome = 'sent'
    pushLobbyLeaveTrace('sendLeaveLobby()')
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
  return new LobbyWorldPanel()
}
