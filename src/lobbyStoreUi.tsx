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
  panel:        Color4.create(0.28, 0.35, 0.38, 0.97), // slate blue-grey (stone panel)
  header:       Color4.create(0.20, 0.26, 0.30, 1),
  rowLabel:     Color4.create(0.20, 0.27, 0.30, 1),
  cardBg:       Color4.create(0.42, 0.58, 0.52, 1),    // sage/turquoise — matches weapon lock cards
  cardSelected: Color4.create(0.30, 0.70, 0.62, 1),    // brighter turquoise when selected
  cardOwned:    Color4.create(0.35, 0.55, 0.48, 1),
  cardLocked:   Color4.create(0.28, 0.36, 0.34, 1),
  detailBg:     Color4.create(0.20, 0.26, 0.30, 1),
  textWhite:    Color4.create(1,    1,    1,    1),
  textGold:     Color4.create(1.0,  0.82, 0.20, 1),    // amber gold — matches "GAME OVER" title
  textGray:     Color4.create(0.75, 0.85, 0.82, 1),
  textGreen:    Color4.create(0.45, 0.95, 0.75, 1),
  textLocked:   Color4.create(0.45, 0.52, 0.50, 1),
  btnBuy:       Color4.create(0.25, 0.62, 0.52, 1),    // teal buy button
  btnOwned:     Color4.create(0.28, 0.45, 0.40, 1),
  btnLocked:    Color4.create(0.22, 0.28, 0.28, 1),
  btnClose:     Color4.create(0.60, 0.10, 0.08, 1),
  star:         Color4.create(1.0,  0.78, 0.10, 1),
  divider:      Color4.create(0.35, 0.45, 0.42, 1),
}

// ─── Weapon display helpers ───────────────────────────────────────────────────

const WEAPON_ROW_LABEL: Record<ArenaWeaponType, string> = {
  gun:      'GUN',
  shotgun:  'SHOTGUN',
  minigun:  'MINIGUN',
}

const WEAPON_EMOJI: Record<ArenaWeaponType, string> = {
  gun:      '🔫',
  shotgun:  '💥',
  minigun:  '⚡',
}

const UPGRADE_STARS = ['★☆☆', '★★☆', '★★★']

const WEAPON_STATS: Partial<Record<LoadoutWeaponId, { dmg: string; rate: string; range: string }>> = {
  gun_t1:       { dmg: '25',  rate: '0.40s', range: 'Long' },
  gun_t2:       { dmg: '35',  rate: '0.35s', range: 'Long' },
  gun_t3:       { dmg: '50',  rate: '0.30s', range: 'Long' },
  shotgun_t1:   { dmg: '60',  rate: '0.90s', range: 'Short' },
  shotgun_t2:   { dmg: '80',  rate: '0.85s', range: 'Short' },
  shotgun_t3:   { dmg: '110', rate: '0.75s', range: 'Short' },
  minigun_t1:   { dmg: '12',  rate: '0.08s', range: 'Medium' },
  minigun_t2:   { dmg: '16',  rate: '0.07s', range: 'Medium' },
  minigun_t3:   { dmg: '22',  rate: '0.06s', range: 'Medium' },
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

function UpgradeCard({ weapon }: { weapon: LoadoutWeaponDefinition }) {
  const isSelected = selectedWeaponId === weapon.id
  const owned = isLoadoutWeaponOwned(weapon.id)
  const unlocked = isPreviousOwned(weapon)
  const emoji = WEAPON_EMOJI[weapon.arenaWeaponType]
  const stars = UPGRADE_STARS[weapon.upgradeLevel - 1]

  const bg = isSelected ? C.cardSelected : owned ? C.cardOwned : unlocked ? C.cardBg : C.cardLocked
  const labelColor = unlocked ? C.textWhite : C.textLocked
  const starColor = unlocked ? C.star : C.textLocked

  return (
    <UiEntity
      uiTransform={{
        width: 110, height: 100,
        margin: { right: 8 },
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 6,
        borderRadius: 6,
      }}
      uiBackground={{ color: bg }}
      onMouseDown={() => { selectedWeaponId = weapon.id }}
    >
      <Label
        value={unlocked ? emoji : '🔒'}
        fontSize={30}
        color={labelColor}
        uiTransform={{ margin: { bottom: 4 } }}
      />
      <Label
        value={`Mk.${weapon.upgradeLevel}`}
        fontSize={12}
        color={labelColor}
      />
      <Label
        value={stars}
        fontSize={12}
        color={starColor}
      />
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
        margin: { bottom: 10 },
      }}
    >
      {/* Row label */}
      <UiEntity
        uiTransform={{
          width: 80, height: 100,
          alignItems: 'center',
          justifyContent: 'center',
          margin: { right: 10 },
          borderRadius: 4,
        }}
        uiBackground={{ color: C.rowLabel }}
      >
        <Label
          value={WEAPON_ROW_LABEL[weaponType]}
          fontSize={12}
          color={C.textGray}
        />
      </UiEntity>

      {/* 3 upgrade cards */}
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
  const emoji = WEAPON_EMOJI[weapon.arenaWeaponType]
  const stars = UPGRADE_STARS[weapon.upgradeLevel - 1]

  return (
    <UiEntity
      uiTransform={{
        width: 220,
        flexDirection: 'column',
        alignItems: 'center',
        padding: 14,
        borderRadius: 8,
        alignSelf: 'flex-start',
      }}
      uiBackground={{ color: C.detailBg }}
    >
      <Label value={weapon.label} fontSize={18} color={C.textWhite} uiTransform={{ margin: { bottom: 2 } }} />
      <Label value={weapon.previewLabel} fontSize={11} color={C.textGray} uiTransform={{ margin: { bottom: 10 } }} />

      <Label value={emoji} fontSize={52} color={C.textWhite} uiTransform={{ margin: { bottom: 6 } }} />
      <Label value={stars} fontSize={18} color={C.star} uiTransform={{ margin: { bottom: 14 } }} />

      <UiEntity uiTransform={{ flexDirection: 'column', width: '100%', margin: { bottom: 12 } }}>
        <StatRow label="Damage"    value={stats.dmg} />
        <StatRow label="Fire Rate" value={stats.rate} />
        <StatRow label="Range"     value={stats.range} />
      </UiEntity>

      {/* Gold balance */}
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { bottom: 10 } }}>
        <Label value="GOLD: " fontSize={12} color={C.textGray} />
        <Label value={`${gold}`} fontSize={14} color={C.textGold} />
      </UiEntity>

      {/* Action button */}
      {owned ? (
        <UiEntity
          uiTransform={{ width: '100%', height: 38, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}
          uiBackground={{ color: C.btnOwned }}
        >
          <Label value="✓ OWNED" fontSize={14} color={C.textGreen} />
        </UiEntity>
      ) : !unlocked ? (
        <UiEntity
          uiTransform={{ width: '100%', height: 38, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}
          uiBackground={{ color: C.btnLocked }}
        >
          <Label value="🔒 Unlock previous first" fontSize={11} color={C.textLocked} />
        </UiEntity>
      ) : (
        <UiEntity
          uiTransform={{ width: '100%', height: 38, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}
          uiBackground={{ color: canAfford ? C.btnBuy : C.btnLocked }}
          onMouseDown={canAfford ? () => sendBuyLoadoutWeapon(weapon.id) : undefined}
        >
          <Label
            value={canAfford ? `BUY  ${weapon.priceGold} G` : `Need ${weapon.priceGold} G`}
            fontSize={14}
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
      uiTransform={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', margin: { bottom: 4 } }}
    >
      <Label value={label} fontSize={11} color={C.textGray} />
      <Label value={value}  fontSize={11} color={C.textWhite} />
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
      }}
      uiBackground={{ color: C.overlay }}
    >
      <UiEntity
        uiTransform={{
          flexDirection: 'column',
          padding: 18,
          borderRadius: 10,
          minWidth: 700,
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
            margin: { bottom: 16 },
          }}
        >
          <Label value="UPGRADE SHOP" fontSize={22} color={C.textWhite} />
          <UiEntity
            uiTransform={{ width: 88, height: 34, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}
            uiBackground={{ color: C.btnClose }}
            onMouseDown={() => closeLobbyStore()}
          >
            <Label value="Close" fontSize={15} color={C.textWhite} />
          </UiEntity>
        </UiEntity>

        {/* Body: weapon rows + detail */}
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          {/* Left: 3 rows */}
          <UiEntity
            uiTransform={{ flexDirection: 'column', margin: { right: 16 } }}
          >
            {WEAPON_ROWS.map((t) => (
              <WeaponRow weaponType={t} />
            ))}
          </UiEntity>

          {/* Right: detail panel */}
          <DetailPanel weapon={selected} />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}
