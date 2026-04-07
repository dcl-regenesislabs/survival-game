import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { engine, UiCanvasInformation } from '@dcl/sdk/ecs'
import {
  LOADOUT_WEAPON_DEFINITIONS,
  LoadoutWeaponDefinition,
  LoadoutWeaponId,
  ArenaWeaponType,
  getWeaponUpgrades
} from './shared/loadoutCatalog'
import { getPlayerGold, isLoadoutWeaponEquipped, isLoadoutWeaponOwned } from './loadoutState'
import { sendBuyLoadoutWeapon, sendEquipLoadoutWeapon, sendRequestLoadoutRefresh } from './multiplayer/lobbyClient'
import { endUiPointerCapture } from './gameplayInput'

let storeOpen = false
let selectedWeaponId: LoadoutWeaponId = LOADOUT_WEAPON_DEFINITIONS[0].id

export function openLobbyStore(): void {
  storeOpen = true
  selectedWeaponId = LOADOUT_WEAPON_DEFINITIONS[0].id
  sendRequestLoadoutRefresh()
}

export function closeLobbyStore(): void {
  storeOpen = false
  endUiPointerCapture()
}

function getUiCanvasInfo() {
  return UiCanvasInformation.getOrNull(engine.RootEntity)
}

function getEffectiveCanvasViewport() {
  const canvasInfo = getUiCanvasInfo()
  if (!canvasInfo) return null

  const devicePixelRatio = canvasInfo.devicePixelRatio > 0 ? canvasInfo.devicePixelRatio : 1
  return {
    width: Math.round(canvasInfo.width / devicePixelRatio),
    height: Math.round(canvasInfo.height / devicePixelRatio),
    devicePixelRatio,
  }
}

function getStoreScaleProfile() {
  const effectiveViewport = getEffectiveCanvasViewport()
  if (!effectiveViewport) {
    return { width: 1, height: 1, spacing: 1, font: 1, image: 1, button: 1 }
  }

  const shortestEffectiveSide = Math.min(effectiveViewport.width, effectiveViewport.height)

  if (shortestEffectiveSide <= 460) {
    return { width: 1.10, height: 1.26, spacing: 1.12, font: 1.52, image: 1.40, button: 1.22 }
  }

  if (shortestEffectiveSide <= 540) {
    return { width: 1.08, height: 1.20, spacing: 1.10, font: 1.40, image: 1.30, button: 1.18 }
  }

  if (shortestEffectiveSide <= 720) {
    return { width: 1.04, height: 1.10, spacing: 1.06, font: 1.18, image: 1.14, button: 1.10 }
  }

  return { width: 1, height: 1, spacing: 1, font: 1, image: 1, button: 1 }
}

function scaleStoreUiValue(value: number, scale: number = 1): number {
  return scale === 1 ? value : Math.max(1, Math.round(value * scale))
}

function scaleStoreWidth(value: number): number {
  return scaleStoreUiValue(value, getStoreScaleProfile().width)
}

function scaleStoreHeight(value: number): number {
  return scaleStoreUiValue(value, getStoreScaleProfile().height)
}

function scaleStoreSpacing(value: number): number {
  return scaleStoreUiValue(value, getStoreScaleProfile().spacing)
}

function scaleStoreFont(value: number): number {
  return scaleStoreUiValue(value, getStoreScaleProfile().font)
}

function scaleStoreImage(value: number): number {
  return scaleStoreUiValue(value, getStoreScaleProfile().image)
}

function scaleStoreButton(value: number): number {
  return scaleStoreUiValue(value, getStoreScaleProfile().button)
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
  overlay:      Color4.create(0,    0,    0,    0.75),
  panel:        Color4.create(0.161, 0.267, 0.180, 0.94),
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
  minigun: 'MINI\nGUN',
}

const WEAPON_BASE_LABEL: Record<ArenaWeaponType, string> = {
  gun: 'Pistol',
  shotgun: 'Shotgun',
  minigun: 'Minigun',
}

const WEAPON_TIER_LABEL: Record<LoadoutWeaponDefinition['upgradeLevel'], string> = {
  1: 'Basic',
  2: 'Super',
  3: 'Gold',
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

function getShopWeaponLabel(weapon: LoadoutWeaponDefinition): string {
  return `${WEAPON_BASE_LABEL[weapon.arenaWeaponType]} ${WEAPON_TIER_LABEL[weapon.upgradeLevel]}`
}

function getUpgradeTierLabel(weapon: LoadoutWeaponDefinition): string {
  return WEAPON_TIER_LABEL[weapon.upgradeLevel]
}

// ─── Upgrade card ─────────────────────────────────────────────────────────────

function getStoreMetrics() {
  const cardW = scaleStoreWidth(152)
  const cardH = scaleStoreHeight(146)
  const cardGap = scaleStoreSpacing(8)
  const cardImageBox = scaleStoreImage(76)
  const cardImageAreaH = scaleStoreHeight(80)
  const cardNameAreaH = scaleStoreHeight(36)
  const rowGap = scaleStoreSpacing(8)
  const rowLabelW = scaleStoreWidth(118)
  const rowLabelGap = scaleStoreSpacing(12)
  const detailPanelW = scaleStoreWidth(296)
  const detailTitleH = scaleStoreHeight(36)
  const detailSubtitleH = scaleStoreHeight(24)
  const storePanelMaxW = 1080
  const storeBodyGap = scaleStoreSpacing(16)
  const gridColumns = 3
  const leftGridW = rowLabelW + rowLabelGap + cardW * gridColumns + cardGap * (gridColumns - 1)
  const storeContentW = leftGridW + storeBodyGap + detailPanelW
  const storeGridHeight = cardH * WEAPON_ROWS.length + rowGap * (WEAPON_ROWS.length - 1)

  return {
    CARD_W: cardW,
    CARD_H: cardH,
    CARD_GAP: cardGap,
    CARD_IMAGE_BOX: cardImageBox,
    CARD_IMAGE_AREA_H: cardImageAreaH,
    CARD_NAME_AREA_H: cardNameAreaH,
    ROW_GAP: rowGap,
    ROW_LABEL_W: rowLabelW,
    ROW_LABEL_GAP: rowLabelGap,
    DETAIL_PANEL_W: detailPanelW,
    DETAIL_TITLE_H: detailTitleH,
    DETAIL_SUBTITLE_H: detailSubtitleH,
    STORE_PANEL_MAX_W: storePanelMaxW,
    STORE_BODY_GAP: storeBodyGap,
    LEFT_GRID_W: leftGridW,
    STORE_CONTENT_W: storeContentW,
    STORE_GRID_HEIGHT: storeGridHeight,
  }
}

function UpgradeCard({ weapon, isLast }: { weapon: LoadoutWeaponDefinition; isLast?: boolean }) {
  const { CARD_W, CARD_H, CARD_GAP, CARD_IMAGE_BOX, CARD_IMAGE_AREA_H, CARD_NAME_AREA_H } = getStoreMetrics()
  const isSelected = selectedWeaponId === weapon.id
  const owned = isLoadoutWeaponOwned(weapon.id)
  const stars = UPGRADE_STARS[weapon.upgradeLevel - 1]
  const imageSrc = WEAPON_IMAGE[weapon.id]

  const bg = isSelected ? C.cardSelected : owned ? C.cardOwned : C.cardBg

  return (
    <UiEntity
      uiTransform={{
        width: CARD_W, height: CARD_H,
        margin: { right: isLast ? 0 : CARD_GAP },
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: scaleStoreSpacing(6),
        borderRadius: 9,
        flexShrink: 0,
      }}
      uiBackground={{ color: bg }}
      onMouseDown={() => { selectedWeaponId = weapon.id }}
    >
      <UiEntity
        uiTransform={{
          width: '100%',
          height: CARD_IMAGE_AREA_H,
          alignItems: 'center',
          justifyContent: 'center',
          margin: { bottom: scaleStoreSpacing(2) },
        }}
      >
        {imageSrc ? (
          <UiEntity
            uiTransform={{ width: CARD_IMAGE_BOX, height: CARD_IMAGE_BOX }}
            uiBackground={{ textureMode: 'stretch', texture: { src: imageSrc } }}
          />
        ) : (
          <Label value={WEAPON_EMOJI[weapon.arenaWeaponType]} fontSize={scaleStoreFont(38)} color={C.textWhite} />
        )}
      </UiEntity>
      <Label value={stars} fontSize={scaleStoreFont(16)} color={C.star} uiTransform={{ margin: { bottom: scaleStoreSpacing(5) } }} />
      <UiEntity
        uiTransform={{
          width: '100%',
          height: CARD_NAME_AREA_H,
          alignItems: 'center',
          justifyContent: 'center',
          padding: { left: scaleStoreSpacing(4), right: scaleStoreSpacing(4) },
        }}
      >
        <Label
          value={getUpgradeTierLabel(weapon)}
          fontSize={scaleStoreFont(14)}
          color={C.textWhite}
          textAlign="middle-center"
          textWrap="wrap"
          uiTransform={{ width: '100%' }}
        />
      </UiEntity>
    </UiEntity>
  )
}

// ─── Weapon row ───────────────────────────────────────────────────────────────

function WeaponRow({ weaponType, isLast }: { weaponType: ArenaWeaponType; isLast?: boolean }) {
  const { CARD_H, ROW_GAP, ROW_LABEL_W, ROW_LABEL_GAP } = getStoreMetrics()
  const upgrades = getWeaponUpgrades(weaponType)
  return (
    <UiEntity
      uiTransform={{
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        margin: { bottom: isLast ? 0 : ROW_GAP },
      }}
    >
        <UiEntity
        uiTransform={{
          width: ROW_LABEL_W, height: CARD_H,
          alignItems: 'center',
          justifyContent: 'center',
          margin: { right: ROW_LABEL_GAP },
          borderRadius: 6,
          flexShrink: 0,
        }}
        uiBackground={{ color: C.rowLabel }}
      >
        <Label
          value={WEAPON_ROW_LABEL[weaponType]}
          fontSize={scaleStoreFont(weaponType === 'gun' ? 18 : 16)}
          color={C.textGray}
          textAlign="middle-center"
          textWrap="wrap"
          uiTransform={{ width: '100%', padding: { left: scaleStoreSpacing(6), right: scaleStoreSpacing(6) } }}
        />
      </UiEntity>

      {upgrades.map((w, index) =>
        ReactEcs.createElement(UpgradeCard, {
          key: w.id,
          weapon: w,
          isLast: index === upgrades.length - 1
        })
      )}
    </UiEntity>
  )
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ weapon }: { weapon: LoadoutWeaponDefinition }) {
  const { DETAIL_PANEL_W, DETAIL_TITLE_H, DETAIL_SUBTITLE_H, STORE_GRID_HEIGHT } = getStoreMetrics()
  const owned = isLoadoutWeaponOwned(weapon.id)
  const equipped = isLoadoutWeaponEquipped(weapon.id)
  const unlocked = isPreviousOwned(weapon)
  const gold = getPlayerGold()
  const canAfford = gold >= weapon.priceGold
  const stats = WEAPON_STATS[weapon.id] ?? { dmg: '-', rate: '-', range: '-' }
  const stars = UPGRADE_STARS[weapon.upgradeLevel - 1]
  const imageSrc = WEAPON_IMAGE[weapon.id]

  return (
    <UiEntity
      uiTransform={{
        width: DETAIL_PANEL_W,
        height: STORE_GRID_HEIGHT,
        maxWidth: '100%',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: scaleStoreSpacing(12),
        borderRadius: 10,
        margin: { bottom: scaleStoreSpacing(6) },
        flexShrink: 1,
      }}
      uiBackground={{ color: C.detailBg }}
    >
      <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        <UiEntity
          uiTransform={{
            width: '100%',
            height: DETAIL_TITLE_H,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Label
            value={getShopWeaponLabel(weapon)}
            fontSize={scaleStoreFont(26)}
            color={C.textWhite}
            textAlign="middle-center"
            textWrap="wrap"
            uiTransform={{ width: '100%', padding: { left: scaleStoreSpacing(4), right: scaleStoreSpacing(4) } }}
          />
        </UiEntity>
        <UiEntity
          uiTransform={{
            width: '100%',
            height: DETAIL_SUBTITLE_H,
            alignItems: 'center',
            justifyContent: 'center',
            margin: { bottom: scaleStoreSpacing(8) },
          }}
        >
          <Label
            value={weapon.previewLabel}
            fontSize={scaleStoreFont(16)}
            color={C.textGray}
            textAlign="middle-center"
            textWrap="wrap"
            uiTransform={{ width: '100%', padding: { left: scaleStoreSpacing(4), right: scaleStoreSpacing(4) } }}
          />
        </UiEntity>

        {imageSrc ? (
          <UiEntity
            uiTransform={{
              width: scaleStoreImage(108),
              height: scaleStoreImage(108),
              margin: { bottom: scaleStoreSpacing(8) }
            }}
            uiBackground={{ textureMode: 'stretch', texture: { src: imageSrc } }}
          />
        ) : (
          <Label
            value={WEAPON_EMOJI[weapon.arenaWeaponType]}
            fontSize={scaleStoreFont(50)}
            color={C.textWhite}
            uiTransform={{ margin: { bottom: scaleStoreSpacing(8) } }}
          />
        )}

        <Label value={stars} fontSize={scaleStoreFont(24)} color={C.star} uiTransform={{ margin: { bottom: scaleStoreSpacing(8) } }} />

        <UiEntity uiTransform={{ flexDirection: 'column', width: '100%' }}>
          <StatRow label="Damage"    value={stats.dmg} />
          <StatRow label="Fire Rate" value={stats.rate} />
          <StatRow label="Range"     value={stats.range} />
        </UiEntity>
      </UiEntity>

      <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { bottom: scaleStoreSpacing(8) } }}>
          <Label
            value={owned ? 'OWNED' : `PRICE: ${weapon.priceGold} G`}
            fontSize={scaleStoreFont(20)}
            color={owned ? C.textGreen : C.textGold}
          />
        </UiEntity>

        {owned ? (
          <UiEntity
            uiTransform={{ width: '100%', height: scaleStoreButton(36), borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
            uiBackground={{ color: equipped ? C.btnOwned : C.btnBuy }}
            onMouseDown={equipped ? undefined : () => sendEquipLoadoutWeapon(weapon.id)}
          >
            <Label
              value={equipped ? 'EQUIPPED' : 'EQUIP'}
              fontSize={scaleStoreFont(24)}
              color={equipped ? C.textGreen : C.textWhite}
            />
          </UiEntity>
        ) : !unlocked ? (
          <UiEntity
            uiTransform={{ width: '100%', height: scaleStoreButton(36), borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
            uiBackground={{ color: C.btnLocked }}
          >
            <Label value="🔒 Unlock previous first" fontSize={scaleStoreFont(17)} color={C.textLocked} />
          </UiEntity>
        ) : (
          <UiEntity
            uiTransform={{ width: '100%', height: scaleStoreButton(36), borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
            uiBackground={{ color: canAfford ? C.btnBuy : C.btnLocked }}
            onMouseDown={canAfford ? () => sendBuyLoadoutWeapon(weapon.id) : undefined}
          >
            <Label
              value="BUY"
              fontSize={scaleStoreFont(20)}
              color={canAfford ? C.textWhite : C.textGray}
            />
          </UiEntity>
        )}
      </UiEntity>
    </UiEntity>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <UiEntity
      uiTransform={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', margin: { bottom: scaleStoreSpacing(4) } }}
    >
      <Label value={label} fontSize={scaleStoreFont(16)} color={C.textGray} />
      <Label value={value}  fontSize={scaleStoreFont(16)} color={C.textWhite} />
    </UiEntity>
  )
}

// ─── Root store UI ────────────────────────────────────────────────────────────

export function LobbyStoreUi() {
  if (!storeOpen) return null
  const { STORE_PANEL_MAX_W, STORE_CONTENT_W, LEFT_GRID_W, STORE_BODY_GAP } = getStoreMetrics()

  const selected = LOADOUT_WEAPON_DEFINITIONS.find((w) => w.id === selectedWeaponId) ?? LOADOUT_WEAPON_DEFINITIONS[0]

  return (
    <UiEntity
      uiTransform={{
        width: '100%', height: '100%',
        positionType: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
        padding: { left: '2vw', right: '8vw', top: '4vh', bottom: '4vh' },
        pointerFilter: 'block',
        zIndex: 20,
      }}
    >
      <UiEntity
        uiTransform={{
          flexDirection: 'column',
          width: '100%',
          maxWidth: STORE_PANEL_MAX_W,
          padding: scaleStoreSpacing(16),
          borderRadius: 12,
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
            maxWidth: STORE_CONTENT_W,
            alignSelf: 'center',
            margin: { bottom: scaleStoreSpacing(12) },
          }}
        >
          <Label value="UPGRADE SHOP" fontSize={scaleStoreFont(28)} color={C.textWhite} />
          <UiEntity
            uiTransform={{ width: scaleStoreButton(86), height: scaleStoreButton(34), borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
            uiBackground={{ color: C.btnClose }}
            onMouseDown={() => closeLobbyStore()}
          >
            <Label value="Close" fontSize={scaleStoreFont(18)} color={C.textWhite} />
          </UiEntity>
        </UiEntity>

        {/* Body: weapon rows + detail */}
        <UiEntity
          uiTransform={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'flex-start',
            width: '100%',
            maxWidth: STORE_CONTENT_W,
            alignSelf: 'center',
          }}
        >
          <UiEntity
            uiTransform={{
              flexDirection: 'column',
              width: LEFT_GRID_W,
              maxWidth: '100%',
              margin: { right: STORE_BODY_GAP, bottom: scaleStoreSpacing(10) },
              flexShrink: 1,
            }}
          >
            {WEAPON_ROWS.map((t, index) =>
              ReactEcs.createElement(WeaponRow, {
                key: t,
                weaponType: t,
                isLast: index === WEAPON_ROWS.length - 1
              })
            )}
          </UiEntity>

          <DetailPanel weapon={selected} />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}
