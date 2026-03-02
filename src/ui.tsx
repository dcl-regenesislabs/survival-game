import ReactEcs, { ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { getWaveUiState, getWaveCountdownLabel } from './waveManager'
import { getPlayerHp, isPlayerDead, MAX_HP } from './playerHealth'
import { getZombieCoins } from './zombieCoins'
import { getGameTime } from './zombie'
import { isRaging, getRageTimeLeft } from './rageEffect'
import { getEquippedArenaWeapons } from './loadoutState'
import {
  getCurrentWeapon,
  isShotgunUnlocked,
  isMinigunUnlocked,
  canAffordShotgun,
  canAffordMinigun,
  switchTo
} from './weaponManager'
import { tryPlaceBrick, BRICK_COST_ZC } from './brick'
import {
  getLobbyState,
  getMatchRuntimeState,
  getLatestLobbyEvent,
  shouldShowGameOverOverlay,
  getLocalAddress,
  isLocalReadyForMatch,
  sendCreateMatch,
  sendJoinLobby,
  sendLeaveLobby,
  sendReturnToLobby,
  sendStartZombieWaves
} from './multiplayer/lobbyClient'
import { LobbyPhase } from './shared/lobbySchemas'
import { WaveCyclePhase } from './shared/matchRuntimeSchemas'
import { getServerTime } from './shared/timeSync'

const ENABLE_LEGACY_LOBBY_ROUND_UI = false
const LOADOUT_TELEPORT_POSITION = { x: 81.4, y: 3, z: 21.5 }
const LOADOUT_LOOK_TARGET = { x: 76, y: 3, z: 21.5 }

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiMenu, { virtualWidth: 1920, virtualHeight: 1080 })
}

export const uiMenu = () => {
  const state = getWaveUiState()
  const lobbyState = getLobbyState()
  const localAddress = getLocalAddress()
  const isInLobby = !!localAddress && !!lobbyState?.players.find((p) => p.address === localAddress)
  const isHost = !!localAddress && lobbyState?.hostAddress === localAddress
  const lobbyPlayersText = lobbyState?.players.length
    ? lobbyState.players.map((p) => p.displayName).join(', ')
    : 'No players'
  const lobbyPhaseLabel = lobbyState?.phase === LobbyPhase.MATCH_CREATED ? 'Match Created' : 'Lobby'
  const matchRuntime = getMatchRuntimeState()
  const inMatchContext = lobbyState?.phase === LobbyPhase.MATCH_CREATED && isInLobby
  const syncedZombiesLeft = matchRuntime?.zombiesAlive ?? 0
  const localReadyForMatch = isLocalReadyForMatch()
  const showStartZombiesButton = isInLobby && localReadyForMatch
  const canStartZombies = inMatchContext
  const timerNowMs = getServerTime()
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

  const showZcCounter = !isIdle || inMatchContext

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

            <UiEntity
              uiTransform={{ width: 130, height: 36 }}
              uiBackground={{ color: Color4.create(isHost ? 0.7 : 0.35, 0.45, 0.15, 1) }}
              onMouseDown={() => {
                if (!isHost) return
                sendReturnToLobby()
              }}
            >
              <UiEntity
                uiTransform={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
                uiText={{ value: 'Back Lobby', fontSize: 16, color: Color4.create(1, 1, 1, 1), textAlign: 'middle-center' }}
              />
            </UiEntity>
          </UiEntity>
        </UiEntity>
      )}

      {isRaging() && (
        <UiEntity
          uiTransform={{
            position: { top: 24, left: 0 },
            positionType: 'absolute',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%'
          }}
        >
          <UiEntity
            uiTransform={{
              padding: { left: 16, right: 16, top: 8, bottom: 8 }
            }}
            uiBackground={{ color: Color4.create(0.6, 0.1, 0.2, 0.9) }}
          >
            <UiEntity
              uiTransform={{ padding: { left: 4, right: 4 } }}
              uiText={{
                value: `RAGED • ${Math.ceil(getRageTimeLeft(getGameTime()))}s`,
                fontSize: 20,
                color: Color4.create(1, 0.7, 0.8, 1),
                textAlign: 'middle-center'
              }}
            />
          </UiEntity>
        </UiEntity>
      )}
      {inMatchContext && matchRuntime?.isRunning && (
        <UiEntity
          uiTransform={{
            position: { top: 24, left: 0 },
            positionType: 'absolute',
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <UiEntity
            uiTransform={{
              minWidth: 380,
              height: 54,
              padding: { left: 18, right: 18, top: 8, bottom: 8 }
            }}
            uiBackground={{ color: Color4.create(0.08, 0.08, 0.1, 0.86) }}
          >
            <UiEntity
              uiTransform={{
                width: '100%',
                height: '100%',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              uiText={{
                value: `Synced Zombies Left: ${syncedZombiesLeft}`,
                fontSize: 24,
                color: Color4.create(1, 0.9, 0.6, 1),
                textAlign: 'middle-center'
              }}
            />
          </UiEntity>
        </UiEntity>
      )}
      {showZcCounter && (
        <UiEntity
          uiTransform={{
            position: { top: 0, bottom: 0, right: 24 },
            positionType: 'absolute',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end'
          }}
        >
          <UiEntity
            uiTransform={{
              width: 480,
              height: 132,
              margin: { right: 36 }
            }}
            uiBackground={{
              color: getZombieCoins() >= BRICK_COST_ZC
                ? Color4.create(0.5, 0.2, 0.1, 0.9)
                : Color4.create(0.25, 0.2, 0.18, 0.85)
            }}
            onMouseDown={() => {
              if (getZombieCoins() >= BRICK_COST_ZC) tryPlaceBrick()
            }}
          >
            <UiEntity
              uiTransform={{
                width: '100%',
                height: '100%',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: { left: 36, right: 36 }
              }}
              uiText={{
                value: `Brick (${BRICK_COST_ZC} ZC)`,
                fontSize: 54,
                color:
                  getZombieCoins() >= BRICK_COST_ZC
                    ? Color4.create(1, 0.9, 0.8, 1)
                    : Color4.create(0.6, 0.55, 0.5, 0.9),
                textAlign: 'middle-center'
              }}
            />
          </UiEntity>
          <UiEntity
            uiTransform={{
              width: 140,
              height: 40
            }}
            uiBackground={{ color: Color4.create(0.1, 0.1, 0.15, 0.85) }}
          >
            <UiEntity
              uiTransform={{
                width: '100%',
                height: '100%',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: { left: 16, right: 16 }
              }}
              uiText={{
                value: `ZC: ${getZombieCoins()}`,
                fontSize: 22,
                color: Color4.create(1, 0.85, 0.3, 1),
                textAlign: 'middle-center'
              }}
            />
          </UiEntity>
        </UiEntity>
      )}
      {isIdle && !playerDead && !inMatchContext && (
        <UiEntity
          uiTransform={{
            width: '100%',
            height: 120,
            position: { top: 24, left: 0 },
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start'
          }}
        >
          <UiEntity
            uiTransform={{ width: 400, height: 48 }}
            uiText={{
              value: 'Press START (Button3) to begin',
              fontSize: 22,
              color: Color4.create(1, 1, 1, 0.9),
              textAlign: 'middle-center'
            }}
          />
        </UiEntity>
      )}
      {showStartZombiesButton && (
        <UiEntity
          uiTransform={{
            width: '100%',
            position: { bottom: 176, left: 0 },
            positionType: 'absolute',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <UiEntity
            uiTransform={{ width: 420, height: 84 }}
            uiBackground={{ color: canStartZombies ? Color4.create(0.12, 0.5, 0.18, 0.95) : Color4.create(0.2, 0.2, 0.2, 0.9) }}
            onMouseDown={() => {
              if (!canStartZombies) return
              sendStartZombieWaves()
            }}
          >
            <UiEntity
              uiTransform={{
                width: '100%',
                height: '100%',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              uiText={{
                value: canStartZombies
                  ? matchRuntime?.isRunning
                    ? wavePhaseLabel
                    : 'Start Zombies'
                  : 'Create Match first',
                fontSize: 32,
                color: Color4.create(1, 1, 1, 1),
                textAlign: 'middle-center'
              }}
            />
          </UiEntity>
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
              width: 480,
              minHeight: 120,
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: { top: 32, bottom: 32, left: 32, right: 32 }
            }}
            uiBackground={{ color: Color4.create(0.2, 0.05, 0.05, 0.95) }}
          >
            <UiEntity
              uiTransform={{ width: '100%', height: 80 }}
              uiText={{
                value: 'YOU DIED',
                fontSize: 48,
                color: Color4.create(1, 0.2, 0.2, 1),
                textAlign: 'middle-center'
              }}
            />
            <UiEntity
              uiTransform={{ width: '100%', height: 28, margin: { top: 8 } }}
              uiText={{
                value: 'Respawn in 2 seconds...',
                fontSize: 18,
                color: Color4.create(0.9, 0.8, 0.8, 0.9),
                textAlign: 'middle-center'
              }}
            />
          </UiEntity>
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
              width: 640,
              minHeight: 160,
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: { top: 28, bottom: 28, left: 28, right: 28 }
            }}
            uiBackground={{ color: Color4.create(0.08, 0.02, 0.02, 0.95) }}
          >
            <UiEntity
              uiTransform={{ width: '100%', height: 78 }}
              uiText={{
                value: 'GAME OVER',
                fontSize: 58,
                color: Color4.create(1, 0.2, 0.2, 1),
                textAlign: 'middle-center'
              }}
            />
            <UiEntity
              uiTransform={{ width: '100%', height: 34, margin: { top: 8 } }}
              uiText={{
                value: 'Returning to lobby...',
                fontSize: 22,
                color: Color4.create(0.95, 0.9, 0.9, 1),
                textAlign: 'middle-center'
              }}
            />
          </UiEntity>
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
      {/* Action bar: lobby placeholders on top, weapon selection in match at bottom */}
      <UiEntity
        uiTransform={{
          width: '100%',
          position: inMatchContext ? { bottom: 24, left: 0 } : { top: 24, left: 0 },
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
          {inMatchContext
            ? getEquippedArenaWeapons().map((weapon) => {
                const current = getCurrentWeapon() === weapon
                const canUse =
                  weapon === 'gun' ||
                  (weapon === 'shotgun' && (isShotgunUnlocked() || canAffordShotgun())) ||
                  (weapon === 'minigun' && (isMinigunUnlocked() || canAffordMinigun()))
                const label = weapon === 'gun' ? 'Gun' : weapon === 'shotgun' ? 'Shotgun' : 'Minigun'
                const bgColor = canUse
                  ? current
                    ? Color4.create(0.15, 0.65, 0.25, 1)
                    : Color4.create(0.2, 0.75, 0.35, 1)
                  : Color4.create(0.35, 0.35, 0.35, 0.7)
                const textColor = canUse
                  ? Color4.create(1, 1, 1, 1)
                  : Color4.create(0.6, 0.6, 0.6, 0.8)
                return (
                  <UiEntity
                    key={weapon}
                    uiTransform={{
                      width: 360,
                      height: 132,
                      margin: { left: 24, right: 24 }
                    }}
                    uiBackground={{ color: bgColor }}
                    onMouseDown={() => {
                      if (canUse) switchTo(weapon)
                    }}
                  >
                    <UiEntity
                      uiTransform={{
                        width: '100%',
                        height: '100%',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      uiText={{
                        value: label,
                        fontSize: 54,
                        color: textColor,
                        textAlign: 'middle-center'
                      }}
                    />
                  </UiEntity>
                )
              })
            : (['Loadout', 'Upgrade'] as const).map((label) => (
                <UiEntity
                  key={label}
                  uiTransform={{
                    width: 360,
                    height: 132,
                    margin: { left: 24, right: 24 }
                  }}
                  uiBackground={{ color: Color4.create(0.2, 0.75, 0.35, 1) }}
                  onMouseDown={() => {
                    if (label !== 'Loadout') return
                    movePlayerTo({
                      newRelativePosition: LOADOUT_TELEPORT_POSITION,
                      cameraTarget: LOADOUT_LOOK_TARGET
                    })
                  }}
                >
                  <UiEntity
                    uiTransform={{
                      width: '100%',
                      height: '100%',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    uiText={{
                      value: label,
                      fontSize: 54,
                      color: Color4.create(1, 1, 1, 1),
                      textAlign: 'middle-center'
                    }}
                  />
                </UiEntity>
              ))}
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}
