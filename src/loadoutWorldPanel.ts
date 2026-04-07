import {
  engine,
  pointerEventsSystem,
  InputAction,
  TextAlignMode,
  Transform,
  MeshRenderer,
  MeshCollider,
  ColliderLayer,
  Material,
  TextShape,
  GltfContainer,
  Animator
} from '@dcl/sdk/ecs'
import { Color4, Color3, Vector3, Quaternion } from '@dcl/sdk/math'
import {
  getPlayerGold,
  isLoadoutWeaponEquipped,
  isLoadoutWeaponOwned
} from './loadoutState'
import {
  LoadoutWeaponDefinition,
  LoadoutWeaponId,
  LOADOUT_WEAPON_DEFINITIONS
} from './shared/loadoutCatalog'
import {
  sendBuyLoadoutWeapon,
  sendEquipLoadoutWeapon
} from './multiplayer/lobbyClient'

const PANEL_WORLD_POSITION = Vector3.create(94, 3, 41.5)
const ROOT_ROTATION = Quaternion.fromEulerDegrees(0, 0, 0)
const PANEL_WORLD_SCALE = Vector3.create(7.2, 4.2, 0.2)
const PANEL_UPDATE_INTERVAL_SECONDS = 0.2
const TITLE_LOCAL_POSITION = Vector3.create(-2.5, 1.25, -0.25)
const DETAILS_LOCAL_POSITION = Vector3.create(-2.45, 0.78, -0.25)
const PREVIEW_TEXT_LOCAL_POSITION = Vector3.create(1.45, -0.62, -0.24)
const PREVIEW_MODEL_LOCAL_POSITION = Vector3.create(1.45, 0.06, -0.19)
const ACTION_BUTTON_OFFSET = Vector3.create(1.45, -1.35, -0.22)
const ACTION_BUTTON_TEXT_OFFSET = Vector3.create(1.45, -1.35, -0.28)
const PREVIEW_MODEL_SCALE = Vector3.create(0.95, 0.95, 0.95)

const WEAPON_MODEL_BY_ID: Partial<Record<LoadoutWeaponId, string>> = {
  shotgun_t1: 'assets/scene/Models/drones/shotgun/DroneShotGun.glb',
  minigun_t1: 'assets/scene/Models/drones/minigun/DroneMinigun.glb'
}

type LoadoutSelectableSlot =
  | { kind: 'weapon'; weapon: LoadoutWeaponDefinition }
  | { kind: 'empty'; label: string; description: string }

const LOADOUT_VISIBLE_SLOTS: LoadoutSelectableSlot[] = [
  {
    kind: 'weapon',
    weapon: LOADOUT_WEAPON_DEFINITIONS.find((weapon) => weapon.id === 'shotgun_t1')!
  },
  {
    kind: 'weapon',
    weapon: LOADOUT_WEAPON_DEFINITIONS.find((weapon) => weapon.id === 'minigun_t1')!
  },
  {
    kind: 'empty',
    label: 'Coming Soon',
    description: 'Reserved slot for the next loadout weapon.'
  }
]

type WeaponSelectButton = {
  slot: LoadoutSelectableSlot
  entity: Entity
  labelEntity: Entity
}

type Entity = ReturnType<typeof engine.addEntity>
type PreviewModelEntry = {
  entity: Entity
  weaponId: LoadoutWeaponId
}

export class LoadoutWorldPanel {
  private rootEntity = engine.addEntity()
  private panelEntity = engine.addEntity()
  private titleEntity = engine.addEntity()
  private detailsEntity = engine.addEntity()
  private previewTextEntity = engine.addEntity()
  private actionButtonEntity = engine.addEntity()
  private actionButtonLabelEntity = engine.addEntity()
  private weaponButtons: WeaponSelectButton[] = []
  private previewModels: PreviewModelEntry[] = []
  private selectedWeaponId: LoadoutWeaponId = 'shotgun_t1'
  private updateAccumulator = 0
  private lastDetailsText = ''
  private lastPreviewText = ''
  private lastActionLabel = ''

  constructor() {
    this.createPanel()
    this.createPreviewModels()
    this.createWeaponButtons()
    this.createActionButton()
    this.updateVisualState()
    engine.addSystem((dt) => this.updateSystem(dt), undefined, 'loadout-world-panel-system')
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
    MeshRenderer.setBox(this.panelEntity)
    Material.setPbrMaterial(this.panelEntity, {
      albedoColor: Color4.create(0.08, 0.08, 0.06, 1),
      emissiveColor: Color3.create(0.18, 0.12, 0.04),
      emissiveIntensity: 0.18,
      metallic: 0,
      roughness: 0.92
    })

    Transform.create(this.titleEntity, {
      parent: this.rootEntity,
      position: TITLE_LOCAL_POSITION,
      rotation: Quaternion.Identity(),
      scale: Vector3.create(0.13, 0.13, 0.13)
    })
    TextShape.create(this.titleEntity, {
      text: 'LOADOUT',
      width: 12,
      height: 1.4,
      fontSize: 8,
      textAlign: TextAlignMode.TAM_TOP_LEFT,
      textColor: Color4.create(0.98, 0.92, 0.76, 1)
    })

    Transform.create(this.detailsEntity, {
      parent: this.rootEntity,
      position: DETAILS_LOCAL_POSITION,
      rotation: Quaternion.Identity(),
      scale: Vector3.create(0.115, 0.115, 0.115)
    })
    TextShape.create(this.detailsEntity, {
      text: '',
      width: 12.5,
      height: 5.4,
      fontSize: 5.7,
      lineCount: 8,
      textWrapping: true,
      textAlign: TextAlignMode.TAM_TOP_LEFT,
      textColor: Color4.create(0.92, 0.94, 0.97, 1)
    })

    Transform.create(this.previewTextEntity, {
      parent: this.rootEntity,
      position: PREVIEW_TEXT_LOCAL_POSITION,
      rotation: Quaternion.Identity(),
      scale: Vector3.create(0.12, 0.12, 0.12)
    })
    TextShape.create(this.previewTextEntity, {
      text: '',
      width: 10,
      height: 5.5,
      fontSize: 5.6,
      lineCount: 8,
      textWrapping: true,
      textAlign: TextAlignMode.TAM_MIDDLE_CENTER,
      textColor: Color4.create(0.82, 0.9, 1, 1)
    })

  }

  private createPreviewModels(): void {
    const previewPosition = PREVIEW_MODEL_LOCAL_POSITION
    const previewRotation = Quaternion.fromEulerDegrees(0, 90, 0)

    for (const weaponId of ['shotgun_t1', 'minigun_t1'] as const) {
      const modelSrc = WEAPON_MODEL_BY_ID[weaponId]
      if (!modelSrc) continue

      const entity = engine.addEntity()
      Transform.create(entity, {
        parent: this.rootEntity,
        position: previewPosition,
        rotation: previewRotation,
        scale: Vector3.Zero()
      })
      GltfContainer.create(entity, {
        src: modelSrc,
        visibleMeshesCollisionMask: 0,
        invisibleMeshesCollisionMask: 0
      })
      this.previewModels.push({ entity, weaponId })
    }
  }

  private createWeaponButtons(): void {
    const xOffset = -2.12
    const startY = -0.15
    const stepY = -0.88

    LOADOUT_VISIBLE_SLOTS.forEach((slot, index) => {
      const buttonEntity = engine.addEntity()
      Transform.create(buttonEntity, {
        parent: this.rootEntity,
        position: Vector3.create(xOffset, startY + index * stepY, -0.22),
        rotation: Quaternion.Identity(),
        scale: Vector3.create(1.95, 0.52, 0.08)
      })
      MeshRenderer.setBox(buttonEntity)
      MeshCollider.setBox(buttonEntity, ColliderLayer.CL_POINTER)
      Material.setPbrMaterial(buttonEntity, {
        albedoColor: Color4.create(0.16, 0.16, 0.16, 1),
        emissiveColor: Color3.create(0.03, 0.03, 0.03),
        emissiveIntensity: 0.1,
        metallic: 0,
        roughness: 0.86
      })
      pointerEventsSystem.onPointerDown(
        {
          entity: buttonEntity,
          opts: {
            button: InputAction.IA_POINTER,
            hoverText: slot.kind === 'weapon' ? slot.weapon.label : slot.label
          }
        },
        () => {
          if (slot.kind !== 'weapon') return
          this.selectedWeaponId = slot.weapon.id
          this.updateVisualState()
        }
      )

      const labelEntity = engine.addEntity()
      Transform.create(labelEntity, {
        parent: this.rootEntity,
        position: Vector3.create(xOffset, startY + index * stepY, -0.28),
        rotation: Quaternion.Identity(),
        scale: Vector3.create(0.11, 0.11, 0.11)
      })
      TextShape.create(labelEntity, {
        text: slot.kind === 'weapon' ? slot.weapon.label : slot.label,
        width: 10,
        height: 2,
        fontSize: 5.8,
        textAlign: TextAlignMode.TAM_MIDDLE_CENTER,
        textColor: Color4.create(0.98, 0.98, 0.98, 1)
      })

      this.weaponButtons.push({ slot, entity: buttonEntity, labelEntity })
    })
  }

  private createActionButton(): void {
    Transform.create(this.actionButtonEntity, {
      parent: this.rootEntity,
      position: ACTION_BUTTON_OFFSET,
      rotation: Quaternion.Identity(),
      scale: Vector3.create(2.35, 0.5, 0.08)
    })
    MeshRenderer.setBox(this.actionButtonEntity)
    MeshCollider.setBox(this.actionButtonEntity, ColliderLayer.CL_POINTER)
    Material.setPbrMaterial(this.actionButtonEntity, {
      albedoColor: Color4.create(0.18, 0.18, 0.18, 1),
      emissiveColor: Color3.create(0.03, 0.03, 0.03),
      emissiveIntensity: 0.1,
      metallic: 0,
      roughness: 0.86
    })
    pointerEventsSystem.onPointerDown(
      { entity: this.actionButtonEntity, opts: { button: InputAction.IA_POINTER, hoverText: 'Loadout Action' } },
      () => this.handleActionClick()
    )

    Transform.create(this.actionButtonLabelEntity, {
      parent: this.rootEntity,
      position: ACTION_BUTTON_TEXT_OFFSET,
      rotation: Quaternion.Identity(),
      scale: Vector3.create(0.11, 0.11, 0.11)
    })
    TextShape.create(this.actionButtonLabelEntity, {
      text: '',
      width: 10,
      height: 2.1,
      fontSize: 5.8,
      textAlign: TextAlignMode.TAM_MIDDLE_CENTER,
      textColor: Color4.create(1, 1, 1, 1)
    })
  }

  private getSelectedWeapon(): LoadoutWeaponDefinition {
    return LOADOUT_WEAPON_DEFINITIONS.find((weapon) => weapon.id === this.selectedWeaponId) ?? LOADOUT_WEAPON_DEFINITIONS[0]
  }

  private handleActionClick(): void {
    const weapon = this.getSelectedWeapon()

    if (!isLoadoutWeaponOwned(weapon.id)) {
      if (getPlayerGold() < weapon.priceGold) return
      sendBuyLoadoutWeapon(weapon.id)
      return
    }

    if (!isLoadoutWeaponEquipped(weapon.id)) {
      sendEquipLoadoutWeapon(weapon.id)
    }
  }

  private buildDetailsText(): string {
    const weapon = this.getSelectedWeapon()
    const owned = isLoadoutWeaponOwned(weapon.id)
    const equipped = isLoadoutWeaponEquipped(weapon.id)
    const status = equipped ? 'Equipped' : owned ? 'Owned' : 'Locked'

    return [
      `Gold: ${getPlayerGold()}`,
      'Default loadout: base tiers included',
      `Weapon: ${weapon.label}`,
      `Arena tier: ${weapon.tierKey.toUpperCase()}`,
      `Price: ${weapon.priceGold} GOLD`,
      `Status: ${status}`,
      '',
      'Select a weapon on the left,',
      'buy it with GOLD, then equip it for arena runs.'
    ].join('\n')
  }

  private buildPreviewText(): string {
    const weapon = this.getSelectedWeapon()
    return [
      weapon.label.toUpperCase(),
      '',
      weapon.previewLabel,
      '',
      `Price: ${weapon.priceGold} GOLD`
    ].join('\n')
  }

  private getActionLabel(): string {
    const weapon = this.getSelectedWeapon()
    if (!isLoadoutWeaponOwned(weapon.id)) {
      return getPlayerGold() >= weapon.priceGold ? `Buy ${weapon.priceGold}G` : `Need ${weapon.priceGold}G`
    }
    if (!isLoadoutWeaponEquipped(weapon.id)) return 'Equip'
    return 'Equipped'
  }

  private updateVisualState(): void {
    const selectedWeapon = this.getSelectedWeapon()
    const detailsText = this.buildDetailsText()
    if (detailsText !== this.lastDetailsText) {
      this.lastDetailsText = detailsText
      TextShape.getMutable(this.detailsEntity).text = detailsText
    }

    const previewText = this.buildPreviewText()
    if (previewText !== this.lastPreviewText) {
      this.lastPreviewText = previewText
      TextShape.getMutable(this.previewTextEntity).text = previewText
    }

    for (const previewModel of this.previewModels) {
      Transform.getMutable(previewModel.entity).scale =
        previewModel.weaponId === selectedWeapon.id ? PREVIEW_MODEL_SCALE : Vector3.Zero()
    }

    const actionLabel = this.getActionLabel()
    if (actionLabel !== this.lastActionLabel) {
      this.lastActionLabel = actionLabel
      TextShape.getMutable(this.actionButtonLabelEntity).text = actionLabel
    }

    for (const button of this.weaponButtons) {
      if (button.slot.kind !== 'weapon') {
        Material.setPbrMaterial(button.entity, {
          albedoColor: Color4.create(0.12, 0.12, 0.12, 1),
          emissiveColor: Color3.create(0.03, 0.03, 0.03),
          emissiveIntensity: 0.08,
          metallic: 0,
          roughness: 0.86
        })
        TextShape.getMutable(button.labelEntity).text = '[...] Coming Soon'
        continue
      }

      const owned = isLoadoutWeaponOwned(button.slot.weapon.id)
      const equipped = isLoadoutWeaponEquipped(button.slot.weapon.id)
      const selected = button.slot.weapon.id === selectedWeapon.id

      const color = selected
        ? Color4.create(0.73, 0.55, 0.2, 1)
        : equipped
          ? Color4.create(0.2, 0.5, 0.28, 1)
          : owned
            ? Color4.create(0.24, 0.28, 0.38, 1)
            : Color4.create(0.18, 0.12, 0.12, 1)

      Material.setPbrMaterial(button.entity, {
        albedoColor: color,
        emissiveColor: selected ? Color3.create(0.18, 0.12, 0.04) : Color3.create(0.04, 0.04, 0.04),
        emissiveIntensity: selected ? 0.22 : 0.12,
        metallic: 0,
        roughness: 0.86
      })

      const labelPrefix = equipped ? '[E] ' : owned ? '[O] ' : '[L] '
      TextShape.getMutable(button.labelEntity).text = `${labelPrefix}${button.slot.weapon.label}`
    }

    const weapon = this.getSelectedWeapon()
    const actionEnabled =
      weapon.priceGold !== 0 &&
      (!isLoadoutWeaponOwned(weapon.id)
        ? getPlayerGold() >= weapon.priceGold
        : !isLoadoutWeaponEquipped(weapon.id))

    Material.setPbrMaterial(this.actionButtonEntity, {
      albedoColor: actionEnabled ? Color4.create(0.22, 0.54, 0.28, 1) : Color4.create(0.18, 0.18, 0.18, 1),
      emissiveColor: actionEnabled ? Color3.create(0.06, 0.1, 0.05) : Color3.create(0.03, 0.03, 0.03),
      emissiveIntensity: actionEnabled ? 0.2 : 0.1,
      metallic: 0,
      roughness: 0.86
    })
  }

  private updateSystem(dt: number): void {
    this.freezePreviewAnimation()

    this.updateAccumulator += dt
    if (this.updateAccumulator < PANEL_UPDATE_INTERVAL_SECONDS) return
    this.updateAccumulator = 0
    this.updateVisualState()
  }

  private freezePreviewAnimation(): void {
    for (const previewModel of this.previewModels) {
      if (!GltfContainer.has(previewModel.entity)) continue
      Animator.createOrReplace(previewModel.entity)
      Animator.stopAllAnimations(previewModel.entity)
    }
  }
}

let loadoutWorldPanel: LoadoutWorldPanel | null = null

export function initLoadoutWorldPanel(): void {
  if (loadoutWorldPanel) return
  loadoutWorldPanel = new LoadoutWorldPanel()
}
