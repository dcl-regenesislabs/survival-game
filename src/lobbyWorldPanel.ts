import {
  engine,
  pointerEventsSystem,
  PointerEvents,
  InputAction,
  PointerEventType,
  TextAlignMode,
  Transform,
  MeshRenderer,
  MeshCollider,
  ColliderLayer,
  Material,
  TextShape
} from '@dcl/sdk/ecs'
import { Color4, Color3, Vector3, Quaternion } from '@dcl/sdk/math'
import { LobbyPhase } from './shared/lobbySchemas'
import { WaveCyclePhase } from './shared/matchRuntimeSchemas'
import { getServerTime } from './shared/timeSync'
import {
  getLatestLobbyEvent,
  getLobbyState,
  getLocalAddress,
  getMatchRuntimeState,
  isLocalReadyForMatch,
  markLocalReadyForMatch,
  sendCreateMatchAndJoin,
  sendLeaveLobby
} from './multiplayer/lobbyClient'

// Place the panel in the new outer parcels (z = -1 row), away from the arena center.
const PANEL_WORLD_POSITION = Vector3.create(24, 2.8, -8)
const PANEL_WORLD_SCALE = Vector3.create(6.4, 3.8, 0.2)
const PANEL_UPDATE_INTERVAL_SECONDS = 0.2
const BUTTON_Y_OFFSET = -1.35
const BUTTON_Z_OFFSET = -0.22
const BUTTON_LABEL_Z_OFFSET = -0.28

type LobbyPanelButton = {
  kind: 'create' | 'leave' | 'ready'
  entity: ReturnType<typeof engine.addEntity>
  labelEntity: ReturnType<typeof engine.addEntity>
}

export class LobbyWorldPanel {
  private panelEntity = engine.addEntity()
  private textEntity = engine.addEntity()
  private buttons: LobbyPanelButton[] = []
  private updateAccumulator = 0
  private lastRenderedText = ''

  constructor() {
    this.createPanel()
    this.createButtons()
    engine.addSystem((dt) => this.updateSystem(dt), undefined, 'lobby-world-panel-system')
  }

  private createPanel(): void {
    Transform.create(this.panelEntity, {
      position: PANEL_WORLD_POSITION,
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
      position: Vector3.create(PANEL_WORLD_POSITION.x - 1.85, PANEL_WORLD_POSITION.y + 0.35, PANEL_WORLD_POSITION.z - 0.25),
      rotation: Quaternion.Identity(),
      scale: Vector3.create(0.3, 0.3, 0.3)
    })

    TextShape.create(this.textEntity, {
      text: 'Loading lobby... ',
      width: 6.0,
      height: 2.4,
      fontSize: 5.55,
      fontAutoSize: false,
      lineCount: 8,
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
  }

  private createButtons(): void {
    this.createButton('create', 'Create Match', -1.85, () => sendCreateMatchAndJoin())
    this.createButton('leave', 'Leave', 0, () => sendLeaveLobby())
    this.createButton('ready', "I'm Ready", 1.85, () => markLocalReadyForMatch())
    this.updateButtonStyles()
  }

  private createButton(
    kind: 'create' | 'leave' | 'ready',
    label: string,
    xOffset: number,
    onClick: () => void
  ): void {
    const buttonEntity = engine.addEntity()
    Transform.create(buttonEntity, {
      position: Vector3.create(
        PANEL_WORLD_POSITION.x + xOffset,
        PANEL_WORLD_POSITION.y + BUTTON_Y_OFFSET,
        PANEL_WORLD_POSITION.z + BUTTON_Z_OFFSET
      ),
      rotation: Quaternion.Identity(),
      scale: Vector3.create(1.55, 0.42, 0.08)
    })
    MeshRenderer.setBox(buttonEntity)
    MeshCollider.setBox(buttonEntity, ColliderLayer.CL_POINTER)
    Material.setPbrMaterial(buttonEntity, {
      albedoColor: Color4.create(0.2, 0.2, 0.2, 1),
      emissiveColor: Color3.create(0.05, 0.05, 0.05),
      emissiveIntensity: 0.15,
      metallic: 0,
      roughness: 0.85
    })
    PointerEvents.create(buttonEntity, {
      pointerEvents: [
        {
          eventType: PointerEventType.PET_DOWN,
          eventInfo: {
            button: InputAction.IA_POINTER,
            hoverText: label,
            maxDistance: 10,
            showFeedback: true
          }
        }
      ]
    })
    pointerEventsSystem.onPointerDown(
      { entity: buttonEntity, opts: { button: InputAction.IA_POINTER, hoverText: label } },
      () => onClick()
    )

    const labelEntity = engine.addEntity()
    Transform.create(labelEntity, {
      position: Vector3.create(
        PANEL_WORLD_POSITION.x + xOffset,
        PANEL_WORLD_POSITION.y + BUTTON_Y_OFFSET,
        PANEL_WORLD_POSITION.z + BUTTON_LABEL_Z_OFFSET
      ),
      rotation: Quaternion.Identity(),
      scale: Vector3.create(0.11, 0.11, 0.11)
    })
    TextShape.create(labelEntity, {
      text: label,
      width: 11,
      height: 2.2,
      fontSize: 5.8,
      textAlign: TextAlignMode.TAM_MIDDLE_CENTER,
      textColor: Color4.create(0.95, 0.97, 1, 1)
    })

    this.buttons.push({ kind, entity: buttonEntity, labelEntity })
  }

  private buildPlayersLine(): string {
    const state = getLobbyState()
    if (!state || !state.players.length) return '- Players: 0 (none)'
    const names = state.players.map((p) => p.displayName)
    const list = names.join(', ')
    const clipped = list.length > 90 ? `${list.slice(0, 87)}...` : list
    return `- Players: ${state.players.length} (${clipped})`
  }

  private buildStatusText(): string {
    const lobby = getLobbyState()
    const runtime = getMatchRuntimeState()
    const timerNowMs = getServerTime()

    const phaseLabel = lobby?.phase === LobbyPhase.MATCH_CREATED ? 'MATCH CREATED' : 'LOBBY'
    const matchId = lobby?.matchId ? lobby.matchId : '-'

    let waveLine = 'Waves: stopped'
    if (runtime?.isRunning) {
      const remaining = Math.max(0, Math.ceil((runtime.phaseEndTimeMs - timerNowMs) / 1000))
      if (runtime.cyclePhase === WaveCyclePhase.ACTIVE) {
        waveLine = `Waves: ACTIVE • wave ${runtime.waveNumber} • ${remaining}s`
      } else {
        waveLine = `Waves: REST • wave ${runtime.waveNumber} • ${remaining}s`
      }
    }

    const lastEvent = getLatestLobbyEvent() || '-'

    return [
      '- SURVIVAL LOBBY',
      `- Phase: ${phaseLabel}`,
      `- Match: ${matchId}`,
      this.buildPlayersLine(),
      `- ${waveLine}`,
      `- Event: ${lastEvent}`
    ].join('\n')
  }

  private updateButtonStyles(): void {
    const lobby = getLobbyState()
    const localAddress = getLocalAddress()
    const isInLobby = !!localAddress && !!lobby?.players.find((p) => p.address === localAddress)
    const canCreateOrJoin = !isInLobby
    const canReady = isInLobby && lobby?.phase === LobbyPhase.MATCH_CREATED && !isLocalReadyForMatch()

    for (const button of this.buttons) {
      const enabled =
        button.kind === 'create' ? canCreateOrJoin : button.kind === 'leave' ? isInLobby : canReady

      let activeColor = Color4.create(0.2, 0.2, 0.2, 1)
      let idleColor = Color4.create(0.12, 0.12, 0.12, 1)
      if (button.kind === 'create') {
        activeColor = Color4.create(0.2, 0.55, 0.28, 1)
        idleColor = Color4.create(0.1, 0.24, 0.14, 1)
      } else if (button.kind === 'leave') {
        activeColor = Color4.create(0.55, 0.22, 0.22, 1)
        idleColor = Color4.create(0.24, 0.1, 0.1, 1)
      } else {
        activeColor = Color4.create(0.2, 0.35, 0.65, 1)
        idleColor = Color4.create(0.1, 0.16, 0.3, 1)
      }

      if (button.kind === 'create') {
        const label = lobby?.phase === LobbyPhase.MATCH_CREATED ? 'Join' : 'Create Match'
        TextShape.getMutable(button.labelEntity).text = label
      }

      Material.setPbrMaterial(button.entity, {
        albedoColor: enabled ? activeColor : idleColor,
        emissiveColor: enabled ? Color3.create(0.07, 0.07, 0.07) : Color3.create(0.03, 0.03, 0.03),
        emissiveIntensity: enabled ? 0.2 : 0.12,
        metallic: 0,
        roughness: 0.85
      })
    }
  }

  private updateSystem(dt: number): void {
    this.updateAccumulator += dt
    if (this.updateAccumulator < PANEL_UPDATE_INTERVAL_SECONDS) return
    this.updateAccumulator = 0
    this.updateButtonStyles()

    const nextText = this.buildStatusText()
    if (nextText === this.lastRenderedText) return

    this.lastRenderedText = nextText
    const mutableText = TextShape.getMutable(this.textEntity)
    mutableText.text = nextText
  }
}

export function initLobbyWorldPanel(): LobbyWorldPanel {
  return new LobbyWorldPanel()
}
