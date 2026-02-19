import ReactEcs, { ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { getWaveUiState, getWaveCountdownLabel } from './waveManager'
import { getPlayerHp, isPlayerDead, MAX_HP } from './playerHealth'
import { getZombieCoins } from './zombieCoins'
import { getGameTime } from './zombie'
import { isRaging, getRageTimeLeft } from './rageEffect'
import {
  getCurrentWeapon,
  isShotgunUnlocked,
  isMinigunUnlocked,
  canAffordShotgun,
  canAffordMinigun,
  switchTo
} from './weaponManager'
import { tryPlaceBrick, BRICK_COST_ZC } from './brick'

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiMenu, { virtualWidth: 1920, virtualHeight: 1080 })
}

export const uiMenu = () => {
  const state = getWaveUiState()
  const countdownLabel = getWaveCountdownLabel()
  const isIdle = state.phase === 'idle'
  const playerDead = isPlayerDead()
  const showCenteredOverlay = !isIdle || playerDead

  const showZcCounter = !isIdle

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
      {isIdle && !playerDead && (
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
      {/* Weapon selection bar at bottom */}
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
          {(['gun', 'shotgun', 'minigun'] as const).map((weapon) => {
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
          })}
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}
