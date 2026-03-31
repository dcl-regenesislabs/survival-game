import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import {
  LOADOUT_WEAPON_DEFINITIONS,
  LoadoutWeaponDefinition,
  LoadoutWeaponId,
  ArenaWeaponType,
  getWeaponUpgrades
} from './shared/loadoutCatalog'
import { getPlayerGold, isLoadoutWeaponOwned } from './loadoutState'
import { sendBuyLoadoutWeapon } from './multiplayer/lobbyClient'

let storeOpen = false
let selectedWeaponId: LoadoutWeaponId = LOADOUT_WEAPON_DEFINITIONS[0].id

export function openLobbyStore(): void {
  storeOpen = true
  selectedWeaponId = LOADOUT_WEAPON_DEFINITIONS[0].id
}

export function closeLobbyStore(): void {
  storeOpen = false
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
  overlay:      Color4.create(0,    0,    0,    0.75),
  panel:        Color4.create(0.28, 0.35, 0.38, 0.97),
  rowLabel:     Color4.create(0.20, 0.27, 0.30, 1),
  cardBg:       Color4.create(0.42, 0.58, 0.52, 1),
  cardSelected: Color4.create(0.30, 0.70, 0.62, 1),
  cardOwned:    Color4.create(0.35, 0.55, 0.48, 1),
  cardLocked:   Color4.create(0.28, 0.36, 0.34, 1),
  detailBg:     Color4.create(0.20, 0.26, 0.30, 1),
  textWhite:    Color4.create(1,    1,    1,    1),
  textGold:     Color4.create(1.0,  0.82, 0.20, 1),
  textGray:     Color4.create(0.75, 0.85, 0.82, 1),
  textGreen:    Color4.create(0.45, 0.95, 0.75, 1),
  textLocked:   Color4.create(0.45, 0.52, 0.50, 1),
  btnBuy:       Color4.create(0.25, 0.62, 0.52, 1),
  btnOwned:     Color4.create(0.28, 0.45, 0.40, 1),
  btnLocked:    Color4.create(0.22, 0.28, 0.28, 1),
  btnClose:     Color4.create(0.60, 0.10, 0.08, 1),
  star:         Color4.create(1.0,  0.78, 0.10, 1),
}

// ─── Assets ───────────────────────────────────────────────────────────────────

const WEAPON_IMAGE: Partial<Record<LoadoutWeaponId, string>> = {
  gun_t1:     'assets/images/Gun01.png',
  gun_t2:     'assets/images/Gun02.png',
  gun_t3:     'assets/images/Gun03.png',
  shotgun_t1: 'assets/images/ShotGun01.png',
  shotgun_t2: 'assets/images/ShotGun02.png',
  shotgun_t3: 'assets/images/ShotGun03.png',
  minigun_t1: 'assets/images/MachineGun01.png',
  minigun_t2: 'assets/images/MachineGun02.png',
  minigun_t3: 'assets/images/MachineGun03.png',
}

const WEAPON_ROW_LABEL: Record<ArenaWeaponType, string> = {
  gun:     'GUN',
  shotgun: 'SHOTGUN',
  minigun: 'MINIGUN',
}

const WEAPON_EMOJI: Record<ArenaWeaponType, string> = {
  gun:     '🔫',
  shotgun: '💥',
  minigun: '⚡',
}

const UPGRADE_STARS = ['★☆☆', '★★☆', '★★★']

const WEAPON_STATS: Partial<Record<LoadoutWeaponId, { dmg: string; rate: string; range: string }>> = {
  gun_t1:     { dmg: '25',  rate: '0.40s', range: 'Long' },
  gun_t2:     { dmg: '35',  rate: '0.35s', range: 'Long' },
  gun_t3:     { dmg: '50',  rate: '0.30s', range: 'Long' },
  shotgun_t1: { dmg: '60',  rate: '0.90s', range: 'Short' },
  shotgun_t2: { dmg: '80',  rate: '0.85s', range: 'Short' },
  shotgun_t3: { dmg: '110', rate: '0.75s', range: 'Short' },
  minigun_t1: { dmg: '12',  rate: '0.08s', range: 'Medium' },
  minigun_t2: { dmg: '16',  rate: '0.07s', range: 'Medium' },
  minigun_t3: { dmg: '22',  rate: '0.06s', range: 'Medium' },
}

const WEAPON_ROWS: ArenaWeaponType[] = ['gun', 'shotgun', 'minigun']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isPreviousOwned(weapon: LoadoutWeaponDefinition): boolean {
  if (weapon.upgradeLevel === 1) return true
  const upgrades = getWeaponUpgrades(weapon.arenaWeaponType)
  const prev = upgrades.find((u) => u.upgradeLevel === weapon.upgradeLevel - 1)
  return prev ? isLoadoutWeaponOwned(prev.id) : true
}

// ─── Upgrade card ─────────────────────────────────────────────────────────────

const CARD_W = 200
const CARD_H = 180

function UpgradeCard({ weapon }: { weapon: LoadoutWeaponDefinition }) {
  const isSelected = selectedWeaponId === weapon.id
  const owned = isLoadoutWeaponOwned(weapon.id)
  const stars = UPGRADE_STARS[weapon.upgradeLevel - 1]
  const imageSrc = WEAPON_IMAGE[weapon.id]

  const bg = isSelected ? C.cardSelected : owned ? C.cardOwned : C.cardBg

  return (
    <UiEntity
      uiTransform={{
        width: CARD_W, height: CARD_H,
        margin: { right: 10 },
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 8,
        borderRadius: 8,
      }}
      uiBackground={{ color: bg }}
      onMouseDown={() => { selectedWeaponId = weapon.id }}
    >
      {imageSrc ? (
        <UiEntity
          uiTransform={{ width: 90, height: 90, margin: { bottom: 6 } }}
          uiBackground={{ textureMode: 'stretch', texture: { src: imageSrc } }}
        />
      ) : (
        <Label
          value={WEAPON_EMOJI[weapon.arenaWeaponType]}
          fontSize={56}
          color={C.textWhite}
          uiTransform={{ margin: { bottom: 6 } }}
        />
      )}
      <Label value={`Mk.${weapon.upgradeLevel}`} fontSize={22} color={C.textWhite} />
      <Label value={stars} fontSize={20} color={C.star} />
    </UiEntity>
  )
}

// ─── Weapon row ───────────────────────────────────────────────────────────────

function WeaponRow({ weaponType }: { weaponType: ArenaWeaponType }) {
  const upgrades = getWeaponUpgrades(weaponType)
  return (
    <UiEntity
      uiTransform={{
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        margin: { bottom: 12 },
      }}
    >
      <UiEntity
        uiTransform={{
          width: 120, height: CARD_H,
          alignItems: 'center',
          justifyContent: 'center',
          margin: { right: 14 },
          borderRadius: 6,
        }}
        uiBackground={{ color: C.rowLabel }}
      >
        <Label value={WEAPON_ROW_LABEL[weaponType]} fontSize={24} color={C.textGray} />
      </UiEntity>

      {upgrades.map((w) => (
        <UpgradeCard weapon={w} />
      ))}
    </UiEntity>
  )
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ weapon }: { weapon: LoadoutWeaponDefinition }) {
  const owned = isLoadoutWeaponOwned(weapon.id)
  const unlocked = isPreviousOwned(weapon)
  const gold = getPlayerGold()
  const canAfford = gold >= weapon.priceGold
  const stats = WEAPON_STATS[weapon.id] ?? { dmg: '-', rate: '-', range: '-' }
  const stars = UPGRADE_STARS[weapon.upgradeLevel - 1]
  const imageSrc = WEAPON_IMAGE[weapon.id]

  return (
    <UiEntity
      uiTransform={{
        width: 460,
        flexDirection: 'column',
        alignItems: 'center',
        padding: 28,
        borderRadius: 10,
        alignSelf: 'flex-start',
      }}
      uiBackground={{ color: C.detailBg }}
    >
      <Label value={weapon.label} fontSize={52} color={C.textWhite} uiTransform={{ margin: { bottom: 4 } }} />
      <Label value={weapon.previewLabel} fontSize={30} color={C.textGray} uiTransform={{ margin: { bottom: 16 } }} />

      {imageSrc ? (
        <UiEntity
          uiTransform={{ width: 180, height: 180, margin: { bottom: 14 } }}
          uiBackground={{ textureMode: 'stretch', texture: { src: imageSrc } }}
        />
      ) : (
        <Label
          value={WEAPON_EMOJI[weapon.arenaWeaponType]}
          fontSize={80}
          color={C.textWhite}
          uiTransform={{ margin: { bottom: 14 } }}
        />
      )}

      <Label value={stars} fontSize={46} color={C.star} uiTransform={{ margin: { bottom: 20 } }} />

      <UiEntity uiTransform={{ flexDirection: 'column', width: '100%', margin: { bottom: 14 } }}>
        <StatRow label="Damage"    value={stats.dmg} />
        <StatRow label="Fire Rate" value={stats.rate} />
        <StatRow label="Range"     value={stats.range} />
      </UiEntity>

      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { bottom: 16 } }}>
        <Label value="GOLD: " fontSize={30} color={C.textGray} />
        <Label value={`${gold}`} fontSize={38} color={C.textGold} />
      </UiEntity>

      {owned ? (
        <UiEntity
          uiTransform={{ width: '100%', height: 56, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
          uiBackground={{ color: C.btnOwned }}
        >
          <Label value="✓ OWNED" fontSize={36} color={C.textGreen} />
        </UiEntity>
      ) : !unlocked ? (
        <UiEntity
          uiTransform={{ width: '100%', height: 56, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
          uiBackground={{ color: C.btnLocked }}
        >
          <Label value="🔒 Unlock previous first" fontSize={28} color={C.textLocked} />
        </UiEntity>
      ) : (
        <UiEntity
          uiTransform={{ width: '100%', height: 56, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
          uiBackground={{ color: canAfford ? C.btnBuy : C.btnLocked }}
          onMouseDown={canAfford ? () => sendBuyLoadoutWeapon(weapon.id) : undefined}
        >
          <Label
            value={canAfford ? `BUY  ${weapon.priceGold} G` : `Need ${weapon.priceGold} G`}
            fontSize={36}
            color={canAfford ? C.textWhite : C.textGray}
          />
        </UiEntity>
      )}
    </UiEntity>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <UiEntity
      uiTransform={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', margin: { bottom: 6 } }}
    >
      <Label value={label} fontSize={28} color={C.textGray} />
      <Label value={value}  fontSize={28} color={C.textWhite} />
    </UiEntity>
  )
}

// ─── Root store UI ────────────────────────────────────────────────────────────

export function LobbyStoreUi() {
  if (!storeOpen) return null

  const selected = LOADOUT_WEAPON_DEFINITIONS.find((w) => w.id === selectedWeaponId) ?? LOADOUT_WEAPON_DEFINITIONS[0]

  return (
    <UiEntity
      uiTransform={{
        width: '100%', height: '100%',
        positionType: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
        padding: { right: 384 },
      }}
    >
      <UiEntity
        uiTransform={{
          flexDirection: 'column',
          padding: 28,
          borderRadius: 12,
          width: 1400,
        }}
        uiBackground={{ color: C.panel }}
      >
        {/* Header */}
        <UiEntity
          uiTransform={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            margin: { bottom: 20 },
          }}
        >
          <Label value="UPGRADE SHOP" fontSize={40} color={C.textWhite} />
          <UiEntity
            uiTransform={{ width: 110, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
            uiBackground={{ color: C.btnClose }}
            onMouseDown={() => closeLobbyStore()}
          >
            <Label value="Close" fontSize={26} color={C.textWhite} />
          </UiEntity>
        </UiEntity>

        {/* Body: weapon rows + detail */}
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <UiEntity uiTransform={{ flexDirection: 'column', margin: { right: 20 }, flexGrow: 1 }}>
            {WEAPON_ROWS.map((t) => (
              <WeaponRow weaponType={t} />
            ))}
          </UiEntity>

          <DetailPanel weapon={selected} />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}
