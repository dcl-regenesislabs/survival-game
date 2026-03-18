import ReactEcs, { ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { getWaveUiState, getWaveCountdownLabel } from './waveManager'
import { getPlayerHp, isPlayerDead, MAX_HP, getRespawnAtMs, getRespawnDelay } from './playerHealth'
import { getZombieCoins } from './zombieCoins'
import { getGameTime } from './zombie'
import { isSpeedActive, getSpeedTimeLeft, SPEED_DURATION_SEC } from './speedEffect'
import { getHealthPickupFeedback } from './potions'
import {
  getCurrentWeapon,
  getWeaponUnlockCost,
  isShotgunUnlocked,
  isMinigunUnlocked,
  isWeaponPurchasedInMatch,
  purchaseWeapon,
  switchTo
} from './weaponManager'
import {
  BRICK_COST_ZC,
  activateBrickTargetMode,
  confirmBrickPlacementFromTargetMode,
  isBrickTargetModeActive
} from './brick'
import { OutlinedText } from './outlineComponent'
import {
  getLobbyState,
  getMatchRuntimeState,
  getLatestLobbyEvent,
  shouldShowGameOverOverlay,
  getLocalAddress,
  isLocalReadyForMatch,
  sendCreateMatch,
  sendJoinLobby,
  sendLeaveLobby
} from './multiplayer/lobbyClient'
import { LobbyPhase } from './shared/lobbySchemas'
import { WaveCyclePhase } from './shared/matchRuntimeSchemas'
import { getServerTime } from './shared/timeSync'

const ENABLE_LEGACY_LOBBY_ROUND_UI = false
const PLAYER_HP_FRAME_WIDTH = 581
const PLAYER_HP_FRAME_HEIGHT = 86
const PLAYER_HP_FRAME_UVS = [0.033237, 0.704231, 0.033237, 0.935231, 0.732659, 0.935231, 0.732659, 0.704231]
const PLAYER_HP_FILL_SOURCE_W = 770
const PLAYER_HP_FILL_SOURCE_H = 76
const PLAYER_HP_FILL_OFFSET_X = 177
const PLAYER_HP_FILL_OFFSET_Y = 37
const PLAYER_HP_FILL_UVS = [0.290462, 0.238462, 0.290462, 0.355385, 0.846821, 0.355385, 0.846821, 0.238462]
const WAVE_ZOMBIES_PANEL_WIDTH = 992
const WAVE_ZOMBIES_PANEL_HEIGHT = 152
const WAVE_ZOMBIES_PANEL_UVS = [0.032514, 0.358462, 0.032514, 0.650769, 0.928468, 0.650769, 0.928468, 0.358462]
const BACK_TO_LOBBY_BUTTON_WIDTH = 127
const BACK_TO_LOBBY_BUTTON_HEIGHT = 94
const BACK_TO_LOBBY_BUTTON_UVS = [0.03396, 0.046154, 0.03396, 0.252308, 0.16474, 0.252308, 0.16474, 0.046154]
const WEAPONS_SHEET_SRC = 'assets/images/WEAPONS2.png'
const WEAPONS_LOCK_SHEET_SRC = 'assets/images/WEAPONS_LOCK2.png'
const GUN_BUTTON_WIDTH = 184
const GUN_BUTTON_HEIGHT = 143
const GUN_BUTTON_UVS = [0.007813, 0.412109, 0.007813, 0.691406, 0.246745, 0.691406, 0.246745, 0.412109]
const SHOTGUN_BUTTON_WIDTH = 188
const SHOTGUN_BUTTON_HEIGHT = 142
const SHOTGUN_BUTTON_UVS = [0.255209, 0.415039, 0.255209, 0.691406, 0.5, 0.691406, 0.5, 0.415039]
const MINIGUN_BUTTON_WIDTH = 191
const MINIGUN_BUTTON_HEIGHT = 143
const MINIGUN_BUTTON_UVS = [0.746094, 0.413086, 0.746094, 0.691406, 0.994792, 0.691406, 0.994792, 0.413086]
const BRICK_BUTTON_WIDTH = 184
const BRICK_BUTTON_HEIGHT = 141
const BRICK_BUTTON_UVS = [0.501302, 0.415039, 0.501302, 0.690429, 0.740234, 0.690429, 0.740234, 0.415039]
const LOBBY_RETURN_POSITION = { x: 78.4, y: 3, z: 31.5 }
const LOBBY_RETURN_LOOK_TARGET = { x: 76.2, y: 3, z: 31 }
const BRICK_TARGET_RETICLE_WIDTH = 106
const BRICK_TARGET_RETICLE_HEIGHT = 98
const WEAPON_SELECTION_BAR_WIDTH = 92
const WEAPON_SELECTION_BAR_HEIGHT = 6
// WEAPONS_LOCK2.png region: x=853, y=92, w=213, h=196 (1536x1024 atlas, V axis bottom-up in UI UVs)
const BRICK_TARGET_RETICLE_UVS = [0.555339, 0.71875, 0.555339, 0.910156, 0.69401, 0.910156, 0.69401, 0.71875]
const LOADOUT_TELEPORT_POSITION = { x: 94, y: 3, z: 38.5 }
const LOADOUT_LOOK_TARGET = { x: 94, y: 3, z: 41.5 }
const DEBUG_FORCE_GAMEPLAY_HUD = true

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiMenu, { virtualWidth: 1920, virtualHeight: 1080 })
}

export const uiMenu = () => {
  const state = getWaveUiState()
  const lobbyState = getLobbyState()
  const localAddress = getLocalAddress()
  const isInLobby = !!localAddress && !!lobbyState?.players.find((p) => p.address === localAddress)
  const isInArenaRoster = !!localAddress && !!lobbyState?.arenaPlayers.find((p) => p.address === localAddress)
  const isHost = !!localAddress && lobbyState?.hostAddress === localAddress
  const lobbyPlayersText = lobbyState?.players.length
    ? lobbyState.players.map((p) => p.displayName).join(', ')
    : 'No players'
  const lobbyPhaseLabel = lobbyState?.phase === LobbyPhase.MATCH_CREATED ? 'Match Created' : 'Lobby'
  const matchRuntime = getMatchRuntimeState()
  const inMatchContext = lobbyState?.phase === LobbyPhase.MATCH_CREATED && isInArenaRoster
  const syncedZombiesLeft = matchRuntime?.zombiesAlive ?? 0
  const localReadyForMatch = isLocalReadyForMatch()
  const showGameplayHud = DEBUG_FORCE_GAMEPLAY_HUD || (inMatchContext && localReadyForMatch) || isInLobby
  const showBackToLobbyButton = isInArenaRoster && localReadyForMatch
  const showPlayerHealthHud = showGameplayHud
  const timerNowMs = getServerTime()
  const arenaIntroSeconds =
    lobbyState?.arenaIntroEndTimeMs && lobbyState.arenaIntroEndTimeMs > timerNowMs
      ? Math.max(0, Math.ceil((lobbyState.arenaIntroEndTimeMs - timerNowMs) / 1000))
      : 0
  const phaseRemainingSeconds = matchRuntime ? Math.max(0, Math.ceil((matchRuntime.phaseEndTimeMs - timerNowMs) / 1000)) : 0
  const wavePhaseLabel =
    matchRuntime?.cyclePhase === WaveCyclePhase.ACTIVE
      ? `Wave ${matchRuntime.waveNumber} • ACTIVE (${phaseRemainingSeconds}s)`
      : `Wave ${matchRuntime?.waveNumber ?? 0} • REST (${phaseRemainingSeconds}s)`
  const latestLobbyEvent = getLatestLobbyEvent()
  const showGameOverOverlay = shouldShowGameOverOverlay()
  const countdownLabel = getWaveCountdownLabel()
  const isIdle = state.phase === 'idle'
  const playerDead = isPlayerDead()
  const showCenteredOverlay = (!isIdle || playerDead) && !inMatchContext
  const showArenaIntroOverlay = inMatchContext && localReadyForMatch && !matchRuntime?.isRunning

  const showZcCounter = showGameplayHud
  const brickTargetModeActive = isBrickTargetModeActive()
  const respawnSecondsLeft = Math.max(0, Math.ceil((getRespawnAtMs() - timerNowMs) / 1000))
  const playerHpRatio = Math.max(0, Math.min(1, getPlayerHp() / MAX_HP))
  const hpFrameScale = PLAYER_HP_FRAME_WIDTH / 968
  const playerHpFillWidth = Math.round(PLAYER_HP_FILL_SOURCE_W * hpFrameScale)
  const playerHpFillHeight = Math.round(PLAYER_HP_FILL_SOURCE_H * hpFrameScale)
  const playerHpFillOffsetX = Math.round(PLAYER_HP_FILL_OFFSET_X * hpFrameScale)
  const playerHpFillOffsetY = Math.round(PLAYER_HP_FILL_OFFSET_Y * hpFrameScale)
  const playerHpFillVisibleWidth = Math.max(0, Math.min(playerHpFillWidth, PLAYER_HP_FRAME_WIDTH - playerHpFillOffsetX))
  const playerHpFillVisibleHeight = Math.max(0, Math.min(playerHpFillHeight, PLAYER_HP_FRAME_HEIGHT - playerHpFillOffsetY))
  const playerHpFillCurrentWidth = Math.max(0, Math.round(playerHpFillVisibleWidth * playerHpRatio))
  const speedActive = showGameplayHud && isSpeedActive()
  const speedFillRatio = speedActive ? Math.max(0, Math.min(1, getSpeedTimeLeft(getGameTime()) / SPEED_DURATION_SEC)) : 0
  const speedBarWidth = Math.max(0, Math.round((playerHpFillVisibleWidth - 90) * 1.178))
  const speedBarHeight = 6
  const speedBarCurrentWidth = Math.max(0, Math.round(speedBarWidth * speedFillRatio))
  const speedBarOffsetX = playerHpFillOffsetX + 10
  const speedBarOffsetTop = playerHpFillOffsetY + playerHpFillVisibleHeight + 1

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        positionType: 'absolute',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start'
      }}
    >
      {ENABLE_LEGACY_LOBBY_ROUND_UI && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 24, left: 24 },
            width: 520,
            minHeight: 250,
            padding: { top: 12, bottom: 12, left: 12, right: 12 },
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'flex-start'
          }}
          uiBackground={{ color: Color4.create(0.08, 0.12, 0.18, 0.92) }}
        >
          <UiEntity
            uiTransform={{ width: '100%', height: 34 }}
            uiText={{
              value: `State: ${lobbyPhaseLabel}${lobbyState?.matchId ? ` • ${lobbyState.matchId}` : ''}`,
              fontSize: 20,
              color: Color4.create(0.75, 0.9, 1, 1),
              textAlign: 'top-left'
            }}
          />
          <UiEntity
            uiTransform={{ width: '100%', minHeight: 42 }}
            uiText={{
              value: `Players (${lobbyState?.players.length ?? 0}): ${lobbyPlayersText}`,
              fontSize: 16,
              color: Color4.create(0.85, 0.9, 0.95, 1),
              textAlign: 'top-left'
            }}
          />
          <UiEntity
            uiTransform={{ width: '100%', height: 52 }}
            uiText={{
              value: `${matchRuntime?.isRunning ? wavePhaseLabel : 'Waves stopped'}\n${latestLobbyEvent ? `Event: ${latestLobbyEvent}` : 'Event: -'}`,
              fontSize: 14,
              color: Color4.create(0.7, 0.8, 0.9, 0.95),
              textAlign: 'top-left'
            }}
          />

          <UiEntity
            uiTransform={{
              width: '100%',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-start',
              margin: { top: 8 }
            }}
          >
            <UiEntity
              uiTransform={{ width: 115, height: 36, margin: { right: 8 } }}
              uiBackground={{ color: Color4.create(isInLobby ? 0.3 : 0.15, 0.55, 0.28, 1) }}
              onMouseDown={() => {
                sendJoinLobby()
              }}
            >
              <UiEntity
                uiTransform={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
                uiText={{ value: 'Join', fontSize: 16, color: Color4.create(1, 1, 1, 1), textAlign: 'middle-center' }}
              />
            </UiEntity>

            <UiEntity
              uiTransform={{ width: 115, height: 36, margin: { right: 8 } }}
              uiBackground={{ color: Color4.create(0.55, 0.2, 0.2, 1) }}
              onMouseDown={() => {
                sendLeaveLobby()
              }}
            >
              <UiEntity
                uiTransform={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
                uiText={{ value: 'Leave', fontSize: 16, color: Color4.create(1, 1, 1, 1), textAlign: 'middle-center' }}
              />
            </UiEntity>

            <UiEntity
              uiTransform={{ width: 135, height: 36, margin: { right: 8 } }}
              uiBackground={{
                color: Color4.create(
                  isInLobby && lobbyState?.phase !== LobbyPhase.MATCH_CREATED ? 0.15 : 0.35,
                  0.45,
                  0.75,
                  1
                )
              }}
              onMouseDown={() => {
                if (!isInLobby) return
                sendCreateMatch()
              }}
            >
              <UiEntity
                uiTransform={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
                uiText={{ value: 'Create Match', fontSize: 16, color: Color4.create(1, 1, 1, 1), textAlign: 'middle-center' }}
              />
            </UiEntity>

          </UiEntity>
        </UiEntity>
      )}

      {speedActive && (
        <UiEntity
          uiTransform={{
            position: { top: 186, left: 0 },
            positionType: 'absolute',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%'
          }}
        >
          <UiEntity
            uiTransform={{
              width: 260,
              height: 36,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <UiEntity
              uiTransform={{ width: '100%', height: '100%' }}
              uiText={{
                value: `Speed • ${Math.ceil(getSpeedTimeLeft(getGameTime()))}s`,
                fontSize: 26,
                color: Color4.create(0.92, 0.78, 0.08, 1),
                textAlign: 'middle-center'
              }}
            />
          </UiEntity>
        </UiEntity>
      )}
      {showPlayerHealthHud && (
        <UiEntity
          uiTransform={{
            position: { left: 64, top: 206 },
            positionType: 'absolute',
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'flex-start'
          }}
        >
            <UiEntity
              uiTransform={{
                width: PLAYER_HP_FRAME_WIDTH,
                height: PLAYER_HP_FRAME_HEIGHT + speedBarHeight + 4,
                positionType: 'relative'
              }}
            >
            <UiEntity
              uiTransform={{
                width: PLAYER_HP_FRAME_WIDTH,
                height: PLAYER_HP_FRAME_HEIGHT,
                positionType: 'absolute',
                position: { left: 0, top: 0 }
              }}
              uiBackground={{
                textureMode: 'stretch',
                texture: { src: 'assets/images/HUD2.png', filterMode: 'bi-linear', wrapMode: 'clamp' },
                uvs: PLAYER_HP_FRAME_UVS
              }}
            />
            <UiEntity
              uiTransform={{
                width: playerHpFillVisibleWidth,
                height: playerHpFillVisibleHeight,
                positionType: 'absolute',
                position: { left: playerHpFillOffsetX, top: playerHpFillOffsetY },
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'flex-start'
              }}
            >
              <UiEntity
                uiTransform={{
                  width: playerHpFillCurrentWidth,
                  height: playerHpFillVisibleHeight
                }}
                uiBackground={{
                  textureMode: 'stretch',
                  texture: { src: 'assets/images/HUD2.png', filterMode: 'bi-linear', wrapMode: 'clamp' },
                  uvs: PLAYER_HP_FILL_UVS
                }}
              />
            </UiEntity>
            {speedActive && (
              <UiEntity
                uiTransform={{
                  width: speedBarWidth,
                  height: speedBarHeight,
                  positionType: 'absolute',
                  position: { left: speedBarOffsetX, top: speedBarOffsetTop + 3 },
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'flex-start'
                }}
                uiBackground={{ color: Color4.create(0.22, 0.16, 0.02, 0.92) }}
              >
                <UiEntity
                  uiTransform={{
                    width: speedBarCurrentWidth,
                    height: speedBarHeight
                  }}
                  uiBackground={{ color: Color4.create(0.95, 0.8, 0.12, 1) }}
                />
              </UiEntity>
            )}
          </UiEntity>
        </UiEntity>
      )}
      {showGameplayHud && (
        <UiEntity
          uiTransform={{
            position: { left: 64, top: 298 },
            positionType: 'absolute',
            width: PLAYER_HP_FRAME_WIDTH,
            height: 28,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <UiEntity
            uiTransform={{ width: '100%', height: '100%' }}
            uiText={{
              value: getHealthPickupFeedback(getGameTime()),
              fontSize: 24,
              color: Color4.create(0.3, 1, 0.42, 1),
              textAlign: 'middle-center'
            }}
          />
        </UiEntity>
      )}
      {showZcCounter && (
        <UiEntity
          uiTransform={{
            position: { left: 0, right: 0, top: 24 },
            positionType: 'absolute',
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'center'
          }}
        >
          <UiEntity
            uiTransform={{
              width: WAVE_ZOMBIES_PANEL_WIDTH,
              height: WAVE_ZOMBIES_PANEL_HEIGHT,
              positionType: 'relative'
            }}
            uiBackground={{
              textureMode: 'stretch',
              texture: { src: 'assets/images/HUD2.png', filterMode: 'bi-linear', wrapMode: 'clamp' },
              uvs: WAVE_ZOMBIES_PANEL_UVS
            }}
          >
            <UiEntity
              uiTransform={{
                width: 150,
                height: 40,
                positionType: 'absolute',
                position: { left: 52, top: 54 },
                alignItems: 'flex-start',
                justifyContent: 'center'
              }}
              uiText={{
                value: `${phaseRemainingSeconds}s`,
                fontSize: 36,
                color: Color4.create(1, 0.9, 0.5, 1),
                textAlign: 'middle-left'
              }}
            />
            <UiEntity
              uiTransform={{
                width: 176,
                height: 70,
                positionType: 'absolute',
                position: { left: 158, top: 28 }
              }}
              uiText={{
                value: `${matchRuntime?.waveNumber ?? state.currentWave}`,
                fontSize: 58,
                color: Color4.create(0.7, 1, 0.45, 1),
                textAlign: 'middle-center'
              }}
            />
            <UiEntity
              uiTransform={{
                width: 176,
                height: 70,
                positionType: 'absolute',
                position: { right: 24, top: 40 }
              }}
              uiText={{
                value: `${syncedZombiesLeft}`,
                fontSize: 58,
                color: Color4.create(1, 0.85, 0.35, 1),
                textAlign: 'middle-center'
              }}
            />
          </UiEntity>
        </UiEntity>
      )}
      {showZcCounter && (
        <UiEntity
          uiTransform={{
            position: { top: 206, right: 24 },
            positionType: 'absolute',
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'flex-end'
          }}
        >
          <UiEntity
            uiTransform={{
              width: 241,
              height: 107
            }}
            uiBackground={{
              textureMode: 'stretch',
              texture: { src: 'assets/images/HUD2.png', filterMode: 'bi-linear', wrapMode: 'clamp' },
              uvs: [0.765896, 0.72, 0.765896, 0.926154, 0.983382, 0.926154, 0.983382, 0.72]
            }}
          >
            <UiEntity
              uiTransform={{
                width: '100%',
                height: '100%',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                margin: {left: 50}
              }}
              uiText={{
                value: `${getZombieCoins()}`,
                fontSize: 35,
                color: Color4.create(1, 0.85, 0.3, 1),
                textAlign: 'middle-center'
              }}
            />
          </UiEntity>
        </UiEntity>
      )}
      {showArenaIntroOverlay && (
        <UiEntity
          uiTransform={{
            width: '100%',
            height: '100%',
            positionType: 'absolute',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <UiEntity
            uiTransform={{
              width: 780,
              minHeight: 180,
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: { top: 28, bottom: 28, left: 32, right: 32 }
            }}
          >
            {arenaIntroSeconds > 0 && (
              <UiEntity
                uiTransform={{ width: '100%', height: 88 }}
                uiText={{
                  value: `${arenaIntroSeconds}`,
                  fontSize: 60,
                  color: Color4.create(1, 0.92, 0.35, 1),
                  textAlign: 'middle-center'
                }}
              />
            )}
          </UiEntity>
        </UiEntity>
      )}
      {showBackToLobbyButton && (
        <UiEntity
          uiTransform={{
            position: { top: 321, right: 24 },
            positionType: 'absolute',
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'flex-end'
          }}
        >
          <UiEntity
            uiTransform={{ width: BACK_TO_LOBBY_BUTTON_WIDTH, height: BACK_TO_LOBBY_BUTTON_HEIGHT }}
            uiBackground={{
              textureMode: 'stretch',
              texture: { src: 'assets/images/HUD2.png', filterMode: 'bi-linear', wrapMode: 'clamp' },
              uvs: BACK_TO_LOBBY_BUTTON_UVS
            }}
            onMouseDown={() => {
              sendLeaveLobby()
              movePlayerTo({
                newRelativePosition: LOBBY_RETURN_POSITION,
                cameraTarget: LOBBY_RETURN_LOOK_TARGET
              })
            }}
          />
        </UiEntity>
      )}
      {playerDead && (
        <UiEntity
          uiTransform={{
            width: '100%',
            height: '100%',
            positionType: 'absolute',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <UiEntity
            uiTransform={{
              width: 744,
              height: 524,
              positionType: 'absolute',
              position: { top: 330 }
            }}
            uiBackground={{
              textureMode: 'stretch',
              texture: { src: 'assets/images/death.png', filterMode: 'bi-linear', wrapMode: 'clamp' }
            }}
          />
          <UiEntity
            uiTransform={{
              width: 744,
              height: 48,
              positionType: 'absolute',
              position: { top: 610 },
              alignItems: 'center',
              justifyContent: 'center'
            }}
            uiText={{
              value: `Respawning in ${respawnSecondsLeft > 0 ? respawnSecondsLeft : getRespawnDelay()} seconds...`,
              fontSize: 34,
              color: Color4.create(0.95, 0.88, 0.76, 1),
              textAlign: 'middle-center'
            }}
          />
        </UiEntity>
      )}
      {showGameOverOverlay && (
        <UiEntity
          uiTransform={{
            width: '100%',
            height: '100%',
            positionType: 'absolute',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <UiEntity
            uiTransform={{
              width: 744,
              height: 524,
              positionType: 'absolute',
              position: { top: 330 }
            }}
            uiBackground={{
              textureMode: 'stretch',
              texture: { src: 'assets/images/gameover.png', filterMode: 'bi-linear', wrapMode: 'clamp' }
            }}
          />
          <UiEntity
            uiTransform={{
              width: 744,
              height: 48,
              positionType: 'absolute',
              position: { top: 610 },
              alignItems: 'center',
              justifyContent: 'center'
            }}
            uiText={{
              value: 'Returning to lobby...',
              fontSize: 34,
              color: Color4.create(0.95, 0.88, 0.76, 1),
              textAlign: 'middle-center'
            }}
          />
        </UiEntity>
      )}
      {showCenteredOverlay && !playerDead && (
        <UiEntity
          uiTransform={{
            width: '100%',
            height: 200,
            positionType: 'absolute',
            position: { top: 24, left: 0 },
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start'
          }}
        >
          <UiEntity
            uiTransform={{
              width: 520,
              minHeight: 140,
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: { top: 20, bottom: 20, left: 24, right: 24 }
            }}
            uiBackground={{ color: Color4.create(0.1, 0.1, 0.15, 0.85) }}
          >
            {countdownLabel.length > 0 && (
              <UiEntity
                uiTransform={{
                  width: '100%',
                  height: 36,
                  margin: { bottom: 8 }
                }}
                uiText={{
                  value: countdownLabel,
                  fontSize: 26,
                  color: Color4.create(1, 0.85, 0.3, 1),
                  textAlign: 'middle-center'
                }}
              />
            )}
            <UiEntity
              uiTransform={{
                width: '100%',
                height: 72,
                alignItems: 'center',
                justifyContent: 'center'
              }}
              uiText={{
                value: state.message,
                fontSize: state.phase === 'countdown' ? 56 : 28,
                color:
                  state.phase === 'game_complete'
                    ? Color4.create(0.3, 1, 0.4, 1)
                    : Color4.create(1, 1, 1, 1),
                textAlign: 'middle-center'
              }}
            />
            {state.phase === 'fighting' && (
              <UiEntity
                uiTransform={{
                  width: '100%',
                  height: 28,
                  margin: { top: 8 }
                }}
                uiText={{
                  value: `Wave ${state.currentWave} • Kill all zombies! • HP: ${getPlayerHp()}/${MAX_HP}`,
                  fontSize: 18,
                  color: Color4.create(0.9, 0.9, 0.9, 0.9),
                  textAlign: 'middle-center'
                }}
              />
            )}
          </UiEntity>
        </UiEntity>
      )}
      {/* Action bar: only visible once player is in active match context */}
      {showGameplayHud && (
        <UiEntity
          uiTransform={{
            width: '100%',
            position: { bottom: 24, left: 0 },
            positionType: 'absolute',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            padding: { left: 24, right: 24 }
          }}
        >
          <UiEntity
            uiTransform={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {(['gun', 'shotgun', 'minigun', 'brick'] as const).map((weapon) => {
                const currentWeapon = getCurrentWeapon()
                const isPurchasableWeapon = weapon === 'shotgun' || weapon === 'minigun'
                const weaponCost = weapon === 'brick' ? BRICK_COST_ZC : isPurchasableWeapon ? getWeaponUnlockCost(weapon) : 0
                const isPurchased = weapon === 'brick' ? true : weapon === 'gun' ? true : isWeaponPurchasedInMatch(weapon)
                const canAfford = weaponCost <= 0 || getZombieCoins() >= weaponCost
                const canUse =
                  weapon === 'gun' ||
                  (weapon === 'shotgun' && isShotgunUnlocked()) ||
                  (weapon === 'minigun' && isMinigunUnlocked()) ||
                  (weapon === 'brick' && getZombieCoins() >= BRICK_COST_ZC)
                const isLockedVisual =
                  weapon === 'gun'
                    ? false
                    : weapon === 'shotgun'
                      ? !isPurchased
                    : weapon === 'minigun'
                        ? !isPurchased
                        : getZombieCoins() < BRICK_COST_ZC
                const isSelected =
                  weapon === 'brick' ? brickTargetModeActive : currentWeapon === weapon
                const buttonWidth =
                  weapon === 'gun'
                    ? GUN_BUTTON_WIDTH
                    : weapon === 'shotgun'
                      ? SHOTGUN_BUTTON_WIDTH
                      : weapon === 'minigun'
                        ? MINIGUN_BUTTON_WIDTH
                        : weapon === 'brick'
                          ? BRICK_BUTTON_WIDTH
                          : 288
                const buttonHeight =
                  weapon === 'gun'
                    ? GUN_BUTTON_HEIGHT
                    : weapon === 'shotgun'
                      ? SHOTGUN_BUTTON_HEIGHT
                      : weapon === 'minigun'
                        ? MINIGUN_BUTTON_HEIGHT
                        : weapon === 'brick'
                          ? BRICK_BUTTON_HEIGHT
                          : 106
                const spriteSheetSrc = isLockedVisual ? WEAPONS_LOCK_SHEET_SRC : WEAPONS_SHEET_SRC
                return (
                  <UiEntity
                    key={weapon}
                    uiTransform={{
                      width: buttonWidth,
                      height: buttonHeight + BRICK_TARGET_RETICLE_HEIGHT + WEAPON_SELECTION_BAR_HEIGHT + 20,
                      positionType: 'relative',
                      margin: { left: 19, right: 19, bottom: 14 },
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-end'
                    }}
                  >
                    {weapon === 'brick' && brickTargetModeActive && (
                      <UiEntity
                        uiTransform={{
                          width: BRICK_TARGET_RETICLE_WIDTH,
                          height: BRICK_TARGET_RETICLE_HEIGHT,
                          margin: { bottom: 12 }
                        }}
                        uiBackground={{
                          textureMode: 'stretch',
                          texture: { src: WEAPONS_LOCK_SHEET_SRC, filterMode: 'tri-linear', wrapMode: 'clamp' },
                          uvs: BRICK_TARGET_RETICLE_UVS
                        }}
                      />
                    )}
                    <UiEntity
                      uiTransform={{
                        width: buttonWidth,
                        height: buttonHeight,
                        positionType: 'relative'
                      }}
                      uiBackground={
                        weapon === 'gun'
                          ? {
                              textureMode: 'stretch',
                              texture: { src: spriteSheetSrc, filterMode: 'tri-linear', wrapMode: 'clamp' },
                              uvs: GUN_BUTTON_UVS
                            }
                          : weapon === 'shotgun'
                            ? {
                                textureMode: 'stretch',
                                texture: { src: spriteSheetSrc, filterMode: 'tri-linear', wrapMode: 'clamp' },
                                uvs: SHOTGUN_BUTTON_UVS
                              }
                            : weapon === 'minigun'
                              ? {
                                  textureMode: 'stretch',
                                  texture: { src: spriteSheetSrc, filterMode: 'tri-linear', wrapMode: 'clamp' },
                                  uvs: MINIGUN_BUTTON_UVS
                                }
                              : weapon === 'brick'
                                ? {
                                    textureMode: 'stretch',
                                    texture: { src: spriteSheetSrc, filterMode: 'tri-linear', wrapMode: 'clamp' },
                                    uvs: BRICK_BUTTON_UVS
                                  }
                                : { color: Color4.create(0.2, 0.75, 0.35, 1) }
                      }
                      onMouseDown={() => {
                        if (weapon === 'brick') {
                          if (!canUse) return
                          if (brickTargetModeActive) {
                            confirmBrickPlacementFromTargetMode()
                          } else {
                            activateBrickTargetMode()
                          }
                        } else {
                          if (!isPurchased) {
                            if (!canAfford) return
                            if (!purchaseWeapon(weapon)) return
                          }
                          switchTo(weapon)
                        }
                      }}
                    >
                      {weaponCost > 0 && ((weapon === 'brick' && !canUse) || (weapon !== 'brick' && !isPurchased)) && (
                        <OutlinedText
                          uiTransform={{
                            width: 64,
                            height: 20,
                            positionType: 'absolute',
                            position: { right: 24, bottom: 20 }
                          }}
                          uiText={{
                            value: `${weaponCost} ZC`,
                            fontSize: 15,
                            color: Color4.create(1, 1, 1, 1),
                            textAlign: 'middle-right'
                          }}
                          outlineColor={Color4.create(0, 0, 0, 1)}
                          outlineKeyPrefix={`weapon-cost-${weapon}`}
                        />
                      )}
                    </UiEntity>
                    {weapon !== 'brick' && isSelected && (
                      <UiEntity
                        uiTransform={{
                          width: WEAPON_SELECTION_BAR_WIDTH,
                          height: WEAPON_SELECTION_BAR_HEIGHT,
                          margin: { top: 8 }
                        }}
                        uiBackground={{ color: Color4.create(0, 0, 0, 1) }}
                      >
                        <UiEntity
                          uiTransform={{
                            width: '100%',
                            height: 4,
                            margin: { top: 1, left: 1, right: 1 }
                          }}
                          uiBackground={{ color: Color4.create(0.529, 0.737, 0.627, 1) }}
                        />
                      </UiEntity>
                    )}
                  </UiEntity>
                )
              })}
          </UiEntity>
        </UiEntity>
      )}
    </UiEntity>
  )
}
