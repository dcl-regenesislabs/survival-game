import { Animator, engine, Entity, GltfContainer, PlayerIdentityData, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import {
  getLobbyState,
  getLocalAddress,
  getPlayerArenaWeapon,
  getPlayerCombatSnapshot,
  isLocalReadyForMatch
} from './multiplayer/lobbyClient'
import { ArenaWeaponType, getArenaWeaponModelPath, getArenaWeaponShootClip } from './shared/loadoutCatalog'
import {
  WEAPON_DEFAULT_ROTATION,
  WEAPON_DEFAULT_SCALE,
  WEAPON_MODEL_VISUAL_OFFSET,
  WEAPON_ROOT_OFFSET
} from './shared/weaponVisuals'

type RemoteWeaponEntry = {
  avatarEntity: Entity
  weaponRootEntity: Entity
  weaponModelEntity: Entity
  weaponType: ArenaWeaponType
  upgradeLevel: number
}

function canShowArenaRemoteWeapons(): boolean {
  const lobbyState = getLobbyState()
  const localAddress = getLocalAddress()
  if (!lobbyState || !localAddress) return false
  if (lobbyState.phase !== 'match_created') return false
  if (!isLocalReadyForMatch()) return false
  return lobbyState.arenaPlayers.some((player) => player.address.toLowerCase() === localAddress)
}

class ArenaRemoteDefaultWeapons {
  private readonly entriesByAddress = new Map<string, RemoteWeaponEntry>()

  constructor() {
    engine.addSystem(() => {
      this.syncRoster()
      this.updateTransforms()
    }, undefined, 'arena-remote-default-weapons-system')
  }

  private syncRoster(): void {
    const lobbyState = getLobbyState()
    const localAddress = getLocalAddress()
    if (!canShowArenaRemoteWeapons()) {
      for (const address of [...this.entriesByAddress.keys()]) {
        this.removeEntry(address)
      }
      return
    }

    const arenaAddresses = new Set((lobbyState?.arenaPlayers ?? []).map((player) => player.address.toLowerCase()))
    const visibleRemoteAddresses = new Set<string>()

    for (const [avatarEntity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
      const address = identity.address?.toLowerCase()
      if (!address || address === localAddress) continue

      const isDead = !!getPlayerCombatSnapshot(address)?.isDead
      const { weaponType, upgradeLevel } = getPlayerArenaWeapon(address)
      if (!arenaAddresses.has(address) || isDead) {
        this.removeEntry(address)
        continue
      }

      visibleRemoteAddresses.add(address)

      const existing = this.entriesByAddress.get(address)
      if (existing) {
        existing.avatarEntity = avatarEntity
        if (existing.weaponType !== weaponType || existing.upgradeLevel !== upgradeLevel) {
          existing.weaponType = weaponType
          existing.upgradeLevel = upgradeLevel
          applyRemoteWeaponModel(existing.weaponModelEntity, weaponType, upgradeLevel)
        }
        continue
      }

      this.entriesByAddress.set(address, {
        avatarEntity,
        ...createRemoteDefaultWeapon(weaponType, upgradeLevel),
        weaponType,
        upgradeLevel
      })
    }

    for (const address of [...this.entriesByAddress.keys()]) {
      if (!visibleRemoteAddresses.has(address)) {
        this.removeEntry(address)
      }
    }
  }

  private updateTransforms(): void {
    for (const entry of this.entriesByAddress.values()) {
      const avatarTransform = Transform.getOrNull(entry.avatarEntity)
      if (avatarTransform == null) continue

      const weaponTransform = Transform.getMutable(entry.weaponRootEntity)
      weaponTransform.position = Vector3.add(
        avatarTransform.position,
        Vector3.rotate(WEAPON_ROOT_OFFSET, avatarTransform.rotation)
      )
      weaponTransform.rotation = Quaternion.multiply(avatarTransform.rotation, WEAPON_DEFAULT_ROTATION)
    }
  }

  private removeEntry(address: string): void {
    const entry = this.entriesByAddress.get(address)
    if (!entry) return
    this.entriesByAddress.delete(address)
    engine.removeEntityWithChildren(entry.weaponRootEntity)
  }

  playShotAnimation(address: string, weaponType: ArenaWeaponType): void {
    const entry = this.entriesByAddress.get(address.toLowerCase())
    if (!entry) return
    if (entry.weaponType !== weaponType) return
    if (!Animator.has(entry.weaponModelEntity)) return

    const animator = Animator.getMutable(entry.weaponModelEntity)
    const clip = getRemoteWeaponShootClip(weaponType, entry.upgradeLevel)
    const shootState = animator.states.find((state) => state.clip === clip)
    if (!shootState) return

    for (const state of animator.states) {
      state.playing = state.clip === clip
      state.loop = false
    }

    shootState.playing = true
    shootState.shouldReset = true
  }
}

let arenaRemoteDefaultWeapons: ArenaRemoteDefaultWeapons | null = null

function getRemoteWeaponShootClip(weaponType: ArenaWeaponType, upgradeLevel: number): string {
  return getArenaWeaponShootClip(weaponType, upgradeLevel)
}

function applyRemoteWeaponModel(weaponModelEntity: Entity, weaponType: ArenaWeaponType, upgradeLevel: number): void {
  GltfContainer.createOrReplace(weaponModelEntity, {
    src: getArenaWeaponModelPath(weaponType, upgradeLevel)
  })

  Animator.createOrReplace(weaponModelEntity, {
    states: [{ clip: getRemoteWeaponShootClip(weaponType, upgradeLevel), playing: false, loop: false, speed: 1 }]
  })
}

function createRemoteDefaultWeapon(weaponType: ArenaWeaponType, upgradeLevel: number): {
  weaponRootEntity: Entity
  weaponModelEntity: Entity
} {
  const weaponRootEntity = engine.addEntity()
  const weaponModelEntity = engine.addEntity()

  Transform.create(weaponRootEntity, {
    position: Vector3.Zero(),
    rotation: WEAPON_DEFAULT_ROTATION,
    scale: WEAPON_DEFAULT_SCALE
  })

  Transform.create(weaponModelEntity, {
    parent: weaponRootEntity,
    position: WEAPON_MODEL_VISUAL_OFFSET,
    rotation: WEAPON_DEFAULT_ROTATION,
    scale: WEAPON_DEFAULT_SCALE
  })

  applyRemoteWeaponModel(weaponModelEntity, weaponType, upgradeLevel)
  return { weaponRootEntity, weaponModelEntity }
}

export function initArenaRemoteDefaultWeapons(): void {
  arenaRemoteDefaultWeapons = new ArenaRemoteDefaultWeapons()
}

export function playRemoteWeaponShotAnimation(address: string, weaponType: ArenaWeaponType): void {
  arenaRemoteDefaultWeapons?.playShotAnimation(address, weaponType)
}

export function isArenaWeaponType(value: string): value is ArenaWeaponType {
  return value === 'gun' || value === 'shotgun' || value === 'minigun'
}
