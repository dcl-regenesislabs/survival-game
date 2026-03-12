import { AvatarModifierArea, AvatarModifierType, engine, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { getLobbyState, getLocalAddress, isLocalReadyForMatch } from './multiplayer/lobbyClient'

const FAR_AWAY = Vector3.create(10000, 10000, 10000)
const ARENA_CENTER = Vector3.create(32, 2, 32)
const ARENA_SIZE = Vector3.create(48, 8, 48)

let initialized = false
let passportBlockerArea: ReturnType<typeof engine.addEntity> | null = null
let isAreaActive = false

function isLocalPlayerInCurrentMatch(): boolean {
  const lobbyState = getLobbyState()
  const localAddress = getLocalAddress()
  if (!lobbyState || !localAddress) return false
  if (lobbyState.phase !== 'match_created') return false
  if (!isLocalReadyForMatch()) return false
  return lobbyState.arenaPlayers.some((player) => player.address === localAddress)
}

function ensurePassportBlockerArea(): ReturnType<typeof engine.addEntity> {
  if (passportBlockerArea !== null) return passportBlockerArea

  passportBlockerArea = engine.addEntity()
  Transform.create(passportBlockerArea, {
    position: FAR_AWAY,
    rotation: Quaternion.Identity(),
    scale: Vector3.One()
  })
  AvatarModifierArea.create(passportBlockerArea, {
    area: ARENA_SIZE,
    modifiers: [AvatarModifierType.AMT_DISABLE_PASSPORTS],
    excludeIds: []
  })

  return passportBlockerArea
}

function passportBlockerSystem(): void {
  const areaEntity = ensurePassportBlockerArea()
  const shouldBeActive = isLocalPlayerInCurrentMatch()
  if (shouldBeActive === isAreaActive) return

  Transform.getMutable(areaEntity).position = shouldBeActive ? ARENA_CENTER : FAR_AWAY
  isAreaActive = shouldBeActive
}

export function initPassportBlockerSystem(): void {
  if (initialized) return
  initialized = true
  engine.addSystem(passportBlockerSystem, undefined, 'passport-blocker-system')
}
