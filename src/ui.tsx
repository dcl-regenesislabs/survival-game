import ReactEcs, { ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { getWaveUiState, getWaveCountdownLabel } from './waveManager'
import { getPlayerHp, isPlayerDead, MAX_HP, getRespawnAtMs, getRespawnDelay, shouldShowDeathOverlay } from './playerHealth'
import { getZombieCoins } from './zombieCoins'
import { getGameTime } from './zombie'
import { isSpeedActive, getSpeedTimeLeft, SPEED_DURATION_SEC } from './speedEffect'
import { isRaging, getRageTimeLeft, RAGE_DURATION_SEC } from './rageEffect'
import { getHealthPickupFeedback } from './potions'
import {
  getCurrentWeapon,
  getWeaponUnlockCost,
  isShotgunUnlocked,
  isMinigunUnlocked,
  isWeaponPurchasedInMatch,
  purchaseWeapon,
  switchTo,
  type WeaponType
} from './weaponManager'
import {
  getMiniGunHeatRatio,
  getMiniGunOverheatCooldownRemaining,
  isMiniGunOverheated
} from './miniGun'
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
  shouldSuppressDeathOverlayForTeamWipe,
  shouldShowGameOverOverlay,
  getLocalAddress,
  isLocalReadyForMatch,
  sendLeaveLobby
} from './multiplayer/lobbyClient'
import { LobbyPhase } from './shared/lobbySchemas'
import { getServerTime } from './shared/timeSync'

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
const WEAPONS_UNLOCK_SHEET_SRC = 'assets/images/WEAPONS_UNLOCK2.png'
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
const LOBBY_RETURN_POSITION = { x: 90, y: 3, z: 32 }
const LOBBY_RETURN_LOOK_TARGET = { x: 106.75, y: 1, z: 32 }
const BRICK_TARGET_RETICLE_WIDTH = 106
const BRICK_TARGET_RETICLE_HEIGHT = 98
const WEAPON_SELECTION_BAR_WIDTH = 92
const WEAPON_SELECTION_BAR_HEIGHT = 6
// WEAPONS_LOCK2.png region: x=853, y=92, w=213, h=196 (1536x1024 atlas, V axis bottom-up in UI UVs)
const BRICK_TARGET_RETICLE_UVS = [0.555339, 0.71875, 0.555339, 0.910156, 0.69401, 0.910156, 0.69401, 0.71875]

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiMenu, { virtualWidth: 1920, virtualHeight: 1080 })
}

export const uiMenu = () => {
  const state = getWaveUiState()
  const lobbyState = getLobbyState()
  const localAddress = getLocalAddress()
  const isInArenaRoster = !!localAddress && !!lobbyState?.arenaPlayers.find((p) => p.address === localAddress)
  const matchRuntime = getMatchRuntimeState()
  const inMatchContext = lobbyState?.phase === LobbyPhase.MATCH_CREATED && isInArenaRoster
  const syncedZombiesLeft = matchRuntime?.zombiesAlive ?? 0
  const localReadyForMatch = isLocalReadyForMatch()
  const showGameplayHud = inMatchContext && localReadyForMatch
  const showBackToLobbyButton = isInArenaRoster && localReadyForMatch
  const showPlayerHealthHud = showGameplayHud
  const timerNowMs = getServerTime()
  const arenaIntroSeconds =
    lobbyState?.arenaIntroEndTimeMs && lobbyState.arenaIntroEndTimeMs > timerNowMs
      ? Math.max(0, Math.ceil((lobbyState.arenaIntroEndTimeMs - timerNowMs) / 1000))
      : 0
  const phaseRemainingSeconds = matchRuntime ? Math.max(0, Math.ceil((matchRuntime.phaseEndTimeMs - timerNowMs) / 1000)) : 0
  const showGameOverOverlay = shouldShowGameOverOverlay()
  const countdownLabel = getWaveCountdownLabel()
  const isIdle = state.phase === 'idle'
  const playerDead = isPlayerDead()
  const showDeathOverlay = !shouldSuppressDeathOverlayForTeamWipe() && !showGameOverOverlay && shouldShowDeathOverlay(timerNowMs)
  const showCenteredOverlay = (!isIdle || playerDead) && !inMatchContext
  const showArenaIntroOverlay = inMatchContext && localReadyForMatch && !matchRuntime?.isRunning

  const showZcCounter = showGameplayHud
  const brickTargetModeActive = isBrickTargetModeActive()
  const currentWeapon = getCurrentWeapon()
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
  const currentGameTime = getGameTime()
  const speedActive = showPlayerHealthHud && isSpeedActive()
  const rageActive = showPlayerHealthHud && isRaging()
  const speedFillRatio = speedActive ? Math.max(0, Math.min(1, getSpeedTimeLeft(currentGameTime) / SPEED_DURATION_SEC)) : 0
  const rageFillRatio = rageActive ? Math.max(0, Math.min(1, getRageTimeLeft(currentGameTime) / RAGE_DURATION_SEC)) : 0
  const effectBarWidth = Math.max(0, Math.round((playerHpFillVisibleWidth - 90) * 1.178))
  const effectBarHeight = 6
  const effectBarCornerRadius = 1
  const effectBarGap = 3
  const speedBarCurrentWidth = Math.max(0, Math.round(effectBarWidth * speedFillRatio))
  const rageBarCurrentWidth = Math.max(0, Math.round(effectBarWidth * rageFillRatio))
  const effectBarOffsetX = playerHpFillOffsetX + 10
  const effectBarBaseTop = playerHpFillOffsetY + playerHpFillVisibleHeight + 10
  const rageBarOffsetTop = effectBarBaseTop
  const speedBarOffsetTop = effectBarBaseTop + (rageActive ? effectBarHeight + effectBarGap : 0)
  const activeEffectBarCount = (rageActive ? 1 : 0) + (speedActive ? 1 : 0)
  const hpHudExtraHeight =
    activeEffectBarCount > 0
      ? activeEffectBarCount * effectBarHeight + Math.max(0, activeEffectBarCount - 1) * effectBarGap + 4
      : 0
  const miniGunHeatRatio = getMiniGunHeatRatio()
  const miniGunOverheated = isMiniGunOverheated()
  const miniGunCooldownRemaining = getMiniGunOverheatCooldownRemaining()
  const miniGunBarWidth = 128
  const miniGunBarHeight = 8
  const miniGunBarFillWidth = miniGunBarWidth * miniGunHeatRatio

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
      {(rageActive || speedActive) && (
        <UiEntity
          uiTransform={{
            position: { top: 186, left: 0 },
            positionType: 'absolute',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%'
          }}
        >
          {rageActive && (
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
                  value: `RAGE • ${Math.ceil(getRageTimeLeft(currentGameTime))}s`,
                  fontSize: 26,
                  color: Color4.create(0.55, 0.08, 0.12, 1),
                  textAlign: 'middle-center'
                }}
              />
            </UiEntity>
          )}
          {speedActive && (
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
          )}
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
                height: PLAYER_HP_FRAME_HEIGHT + hpHudExtraHeight,
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
            {rageActive && (
              <UiEntity
                uiTransform={{
                  width: effectBarWidth,
                  height: effectBarHeight,
                  positionType: 'absolute',
                  position: { left: effectBarOffsetX, top: rageBarOffsetTop },
                  borderRadius: effectBarCornerRadius,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'flex-start'
                }}
                uiBackground={{ color: Color4.create(0.23, 0.05, 0.06, 0.92) }}
              >
                <UiEntity
                  uiTransform={{
                    width: rageBarCurrentWidth,
                    height: effectBarHeight,
                    borderRadius: effectBarCornerRadius
                  }}
                  uiBackground={{ color: Color4.create(0.75, 0.1, 0.14, 1) }}
                />
              </UiEntity>
            )}
            {speedActive && (
              <UiEntity
                uiTransform={{
                  width: effectBarWidth,
                  height: effectBarHeight,
                  positionType: 'absolute',
                  position: { left: effectBarOffsetX, top: speedBarOffsetTop },
                  borderRadius: effectBarCornerRadius,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'flex-start'
                }}
                uiBackground={{ color: Color4.create(0.22, 0.16, 0.02, 0.92) }}
              >
                <UiEntity
                  uiTransform={{
                    width: speedBarCurrentWidth,
                    height: effectBarHeight,
                    borderRadius: effectBarCornerRadius
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
      {playerDead && showDeathOverlay && (
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
              texture: { src: 'assets/images/death2.png', filterMode: 'bi-linear', wrapMode: 'clamp' }
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
              texture: { src: 'assets/images/gameover2.png', filterMode: 'bi-linear', wrapMode: 'clamp' }
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
            {(['gun', 'shotgun', 'minigun', 'brick'] as const).map((weapon: WeaponType | 'brick') => {
                const selectableWeapon = weapon === 'brick' ? null : weapon
                const isPurchasableWeapon = weapon === 'shotgun' || weapon === 'minigun'
                const weaponCost = weapon === 'brick' ? BRICK_COST_ZC : isPurchasableWeapon ? getWeaponUnlockCost(weapon) : 0
                const isPurchased = selectableWeapon === null ? true : selectableWeapon === 'gun' ? true : isWeaponPurchasedInMatch(selectableWeapon)
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
                const isSelected = weapon === 'brick' ? brickTargetModeActive : currentWeapon === selectableWeapon
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
                const spriteSheetSrc =
                  weapon === 'brick'
                    ? canUse
                      ? WEAPONS_SHEET_SRC
                      : WEAPONS_UNLOCK_SHEET_SRC
                    : isPurchasableWeapon && !isPurchased
                      ? canAfford
                        ? WEAPONS_UNLOCK_SHEET_SRC
                        : WEAPONS_LOCK_SHEET_SRC
                      : isLockedVisual
                        ? WEAPONS_LOCK_SHEET_SRC
                        : WEAPONS_SHEET_SRC
                return (
                  <UiEntity
                    key={weapon}
                    uiTransform={{
                      width: buttonWidth,
                      height:
                        buttonHeight +
                        BRICK_TARGET_RETICLE_HEIGHT +
                        WEAPON_SELECTION_BAR_HEIGHT +
                        (weapon === 'minigun' && isSelected ? 38 : 20),
                      positionType: 'relative',
                      margin: { left: 19, right: 19, bottom: 14 },
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-end'
                    }}
                  >
                    {weapon === 'minigun' && isSelected && (
                      <UiEntity
                        uiTransform={{
                          width: miniGunBarWidth,
                          height: 26,
                          margin: { bottom: 8 },
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'flex-end'
                        }}
                      >
                        <UiEntity
                          uiTransform={{ width: miniGunBarWidth, height: 14 }}
                          uiText={{
                            value: miniGunOverheated ? `OVERHEAT ${Math.ceil(miniGunCooldownRemaining)}s` : '',
                            fontSize: 12,
                            color: Color4.create(1, 0.45, 0.3, 1),
                            textAlign: 'middle-center'
                          }}
                        />
                        <UiEntity
                          uiTransform={{
                            width: miniGunBarWidth,
                            height: miniGunBarHeight,
                            borderRadius: 2,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'flex-start'
                          }}
                          uiBackground={{ color: Color4.create(0.18, 0.08, 0.06, 0.95) }}
                        >
                          <UiEntity
                            uiTransform={{
                              width: miniGunBarFillWidth,
                              height: miniGunBarHeight,
                              borderRadius: 2
                            }}
                            uiBackground={{
                              color: miniGunOverheated
                                ? Color4.create(1, 0.28, 0.18, 1)
                                : Color4.create(1, 0.68, 0.18, 1)
                            }}
                          />
                        </UiEntity>
                      </UiEntity>
                    )}
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
                            if (selectableWeapon === null) return
                            if (!purchaseWeapon(selectableWeapon)) return
                          }
                          if (selectableWeapon === null) return
                          switchTo(selectableWeapon)
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
