import { Animator, engine, Entity, GltfContainer, PlayerIdentityData, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { getLobbyState, getLocalAddress, getPlayerCombatSnapshot } from './multiplayer/lobbyClient'

const DEFAULT_GUN_MODEL = 'assets/scene/Models/Gun01/Gun01.glb'
const REMOTE_GUN_OFFSET = Vector3.create(0, 0, 0)
const REMOTE_GUN_ROTATION = Quaternion.Identity()
const REMOTE_GUN_SCALE = Vector3.One()

type RemoteWeaponEntry = {
  avatarEntity: Entity
  weaponRootEntity: Entity
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
    const arenaAddresses = new Set((lobbyState?.arenaPlayers ?? []).map((player) => player.address.toLowerCase()))
    const visibleRemoteAddresses = new Set<string>()

    for (const [avatarEntity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
      const address = identity.address?.toLowerCase()
      if (!address || address === localAddress) continue

      const isDead = !!getPlayerCombatSnapshot(address)?.isDead
      if (!arenaAddresses.has(address) || isDead) {
        this.removeEntry(address)
        continue
      }

      visibleRemoteAddresses.add(address)

      const existing = this.entriesByAddress.get(address)
      if (existing) {
        existing.avatarEntity = avatarEntity
        continue
      }

      this.entriesByAddress.set(address, {
        avatarEntity,
        weaponRootEntity: createRemoteDefaultWeapon()
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

function createRemoteDefaultWeapon(): Entity {
  const weaponRootEntity = engine.addEntity()

  Transform.create(weaponRootEntity, {
    position: Vector3.Zero(),
    rotation: Quaternion.Identity(),
    scale: REMOTE_GUN_SCALE
  })

  GltfContainer.create(weaponRootEntity, {
    src: DEFAULT_GUN_MODEL
  })
  Animator.createOrReplace(weaponRootEntity)
  Animator.stopAllAnimations(weaponRootEntity)

  return weaponRootEntity
}

export function initArenaRemoteDefaultWeapons(): void {
  new ArenaRemoteDefaultWeapons()
}
