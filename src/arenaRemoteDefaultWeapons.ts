import { Animator, engine, Entity, GltfContainer, PlayerIdentityData, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import {
  getLobbyState,
  getLocalAddress,
  getPlayerArenaWeapon,
  getPlayerCombatSnapshot,
  isLocalReadyForMatch
} from './multiplayer/lobbyClient'
import { ArenaWeaponType } from './shared/loadoutCatalog'

const DEFAULT_GUN_MODEL = 'assets/scene/Models/drones/gun/DroneGun.glb'
const SHOTGUN_MODEL = 'assets/scene/Models/drones/shotgun/DroneShotGun.glb'
const MINIGUN_MODEL = 'assets/scene/Models/drones/minigun/DroneMinigun.glb'
const REMOTE_GUN_OFFSET = Vector3.create(0, 0, 0)
const REMOTE_GUN_ROTATION = Quaternion.Identity()
const REMOTE_GUN_SCALE = Vector3.One()

type RemoteWeaponEntry = {
  avatarEntity: Entity
  weaponRootEntity: Entity
  weaponType: ArenaWeaponType
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
      const weaponType = getPlayerArenaWeapon(address)
      if (!arenaAddresses.has(address) || isDead) {
        this.removeEntry(address)
        continue
      }

      visibleRemoteAddresses.add(address)

      const existing = this.entriesByAddress.get(address)
      if (existing) {
        existing.avatarEntity = avatarEntity
        if (existing.weaponType !== weaponType) {
          existing.weaponType = weaponType
          applyRemoteWeaponModel(existing.weaponRootEntity, weaponType)
        }
        continue
      }

      this.entriesByAddress.set(address, {
        avatarEntity,
        weaponRootEntity: createRemoteDefaultWeapon(weaponType),
        weaponType
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
        Vector3.rotate(REMOTE_GUN_OFFSET, avatarTransform.rotation)
      )
      weaponTransform.rotation = Quaternion.multiply(avatarTransform.rotation, REMOTE_GUN_ROTATION)
    }
  }

  private removeEntry(address: string): void {
    const entry = this.entriesByAddress.get(address)
    if (!entry) return
    this.entriesByAddress.delete(address)
    engine.removeEntityWithChildren(entry.weaponRootEntity)
  }
}

function getRemoteWeaponModel(weaponType: ArenaWeaponType): string {
  if (weaponType === 'shotgun') return SHOTGUN_MODEL
  if (weaponType === 'minigun') return MINIGUN_MODEL
  return DEFAULT_GUN_MODEL
}

function applyRemoteWeaponModel(weaponRootEntity: Entity, weaponType: ArenaWeaponType): void {
  GltfContainer.createOrReplace(weaponRootEntity, {
    src: getRemoteWeaponModel(weaponType)
  })
}

function createRemoteDefaultWeapon(weaponType: ArenaWeaponType): Entity {
  const weaponRootEntity = engine.addEntity()

  Transform.create(weaponRootEntity, {
    position: Vector3.Zero(),
    rotation: Quaternion.Identity(),
    scale: REMOTE_GUN_SCALE
  })

  applyRemoteWeaponModel(weaponRootEntity, weaponType)
  Animator.createOrReplace(weaponRootEntity)
  Animator.stopAllAnimations(weaponRootEntity)

  return weaponRootEntity
}

export function initArenaRemoteDefaultWeapons(): void {
  new ArenaRemoteDefaultWeapons()
}
