import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { engine, Transform } from '@dcl/sdk/ecs'
import { beginUiPointerCapture, endUiPointerCapture } from './gameplayInput'
import {
  getLocalAddress,
  getLobbyState,
  getMatchRuntimeState,
  getDebugMessageStats
} from './multiplayer/lobbyClient'
import { ROOM_IDS, RoomId } from './shared/roomConfig'

// entity count is LOCAL to this client — static scene entities (~700)
// zombie counts come from server-synced MatchRuntimeState (available to all clients)

const DEBUG_ALLOWED_ADDRESSES = new Set([
  '0x070f99855d4a4544340ab461eae53922aec14a5d',
  '0xc502975b49398f9754afc4e9693cf0e1594f3275'
])
const DEBUG_ICON_SRC = 'assets/images/reg_tool.png'

const PANEL_W = 820
const PANEL_H = 540
const PANEL_LEFT = (1920 - PANEL_W) / 2
const PANEL_TOP = (1080 - PANEL_H) / 2

const ICON_SIZE = 68
const ICON_LEFT = 1920 - 20 - ICON_SIZE
const ICON_TOP = 170

let isDebugPanelOpen = false
let selectedRoom = 0

const C = {
  bg:          Color4.create(0.04, 0.04, 0.09, 0.97),
  titleBar:    Color4.create(0.08, 0.08, 0.18, 1),
  closeBtn:    Color4.create(0.65, 0.10, 0.08, 1),
  tabInactive: Color4.create(0.14, 0.14, 0.24, 1),
  tabActive:   Color4.create(0.18, 0.46, 0.78, 1),
  statBox:     Color4.create(0.09, 0.09, 0.17, 1),
  roomIdle:    Color4.create(0.09, 0.11, 0.19, 1),
  roomActive:  Color4.create(0.06, 0.18, 0.11, 1),
  separator:   Color4.create(0.18, 0.18, 0.30, 1),
  white:       Color4.create(1, 1, 1, 1),
  gray:        Color4.create(0.65, 0.65, 0.78, 1),
  gold:        Color4.create(1.0, 0.84, 0.20, 1),
  green:       Color4.create(0.30, 0.92, 0.50, 1),
  red:         Color4.create(1.0, 0.28, 0.22, 1),
  cyan:        Color4.create(0.30, 0.85, 1.0, 1),
}

type RoomRow = {
  roomId: RoomId
  num: number
  lobby: number
  arena: number
  running: boolean
  wave: number
  zombies: number
}

function countTransformEntities(): number {
  let n = 0
  for (const _ of engine.getEntitiesWith(Transform)) n++
  return n
}

function getTotalServerZombies(): number {
  let total = 0
  for (const id of ROOM_IDS) {
    total += getMatchRuntimeState(id)?.zombiesAlive ?? 0
  }
  return total
}

function getTotalArenaPlayers(): number {
  let total = 0
  for (const id of ROOM_IDS) {
    const s = getLobbyState(id)
    if (s) total += s.arenaPlayers.length
  }
  return total
}

function getActiveRooms(): number {
  let n = 0
  for (const id of ROOM_IDS) {
    if (getMatchRuntimeState(id)?.isRunning) n++
  }
  return n
}

function buildRoomRows(): RoomRow[] {
  return ROOM_IDS.map((id, i) => {
    const lobby = getLobbyState(id)
    const rt = getMatchRuntimeState(id)
    return {
      roomId: id,
      num: i + 1,
      lobby: lobby?.players.length ?? 0,
      arena: lobby?.arenaPlayers.length ?? 0,
      running: rt?.isRunning ?? false,
      wave: rt?.waveNumber ?? 0,
      zombies: rt?.zombiesAlive ?? 0
    }
  })
}

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <UiEntity
      uiTransform={{
        width: 138,
        height: sub ? 76 : 64,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        padding: { left: 6, right: 6, top: 6, bottom: 6 }
      }}
      uiBackground={{ color: C.statBox }}
    >
      <UiEntity
        uiTransform={{ width: '100%', height: 18 }}
        uiText={{ value: label, fontSize: 11, color: C.gray, textAlign: 'middle-center' }}
      />
      <UiEntity
        uiTransform={{ width: '100%', height: 26 }}
        uiText={{ value: value, fontSize: 19, color: C.gold, textAlign: 'middle-center' }}
      />
      {sub !== undefined && sub.length > 0 && (
        <UiEntity
          uiTransform={{ width: '100%', height: 18 }}
          uiText={{ value: sub, fontSize: 13, color: C.red, textAlign: 'middle-center' }}
        />
      )}
    </UiEntity>
  )
}

function DataPill({ label, value, valueColor }: { label: string; value: string; valueColor?: Color4.ReadonlyColor4 }) {
  return (
    <UiEntity
      uiTransform={{
        width: 90,
        height: '100%',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <UiEntity
        uiTransform={{ width: '100%', height: 18 }}
        uiText={{ value: label, fontSize: 10, color: C.gray, textAlign: 'middle-center' }}
      />
      <UiEntity
        uiTransform={{ width: '100%', height: 24 }}
        uiText={{ value: value, fontSize: 17, color: valueColor ?? C.white, textAlign: 'middle-center' }}
      />
    </UiEntity>
  )
}

function RoomCard({ row }: { row: RoomRow }) {
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: 62,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        margin: { bottom: 8 },
        borderRadius: 8,
        padding: { left: 14, right: 14, top: 0, bottom: 0 },
        flexShrink: 0
      }}
      uiBackground={{ color: row.running ? C.roomActive : C.roomIdle }}
    >
      <UiEntity
        uiTransform={{ width: 72, height: '100%', alignItems: 'center', justifyContent: 'center' }}
        uiText={{ value: `ROOM ${row.num}`, fontSize: 15, color: C.white, textAlign: 'middle-center' }}
      />
      <DataPill label="LOBBY" value={`${row.lobby}`} />
      <DataPill label="ARENA" value={`${row.arena}`} />
      <DataPill label="STATUS" value={row.running ? 'ACTIVE' : 'IDLE'} valueColor={row.running ? C.green : C.gray} />
      <DataPill label="WAVE" value={`${row.wave}`} valueColor={C.cyan} />
      <DataPill label="ZOMBIES" value={`${row.zombies}`} valueColor={row.zombies > 0 ? C.red : C.gray} />
    </UiEntity>
  )
}

export function DebugConsoleUi() {
  if (!DEBUG_ALLOWED_ADDRESSES.has(getLocalAddress())) return null

  const msgs = getDebugMessageStats()
  const entities = countTransformEntities()
  const serverZombies = getTotalServerZombies()
  const arenaPlayers = getTotalArenaPlayers()
  const activeRooms = getActiveRooms()
  const allRows = buildRoomRows()
  const shownRows = selectedRoom === 0 ? allRows : [allRows[selectedRoom - 1]]

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        positionType: 'absolute',
        position: { left: 0, top: 0 }
      }}
    >
      {/* Debug icon toggle button */}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { left: ICON_LEFT, top: ICON_TOP },
          width: ICON_SIZE,
          height: ICON_SIZE
        }}
        uiBackground={{
          textureMode: 'stretch',
          texture: { src: DEBUG_ICON_SRC, filterMode: 'bi-linear', wrapMode: 'clamp' }
        }}
        onMouseDown={() => {
          beginUiPointerCapture()
          isDebugPanelOpen = !isDebugPanelOpen
        }}
        onMouseUp={endUiPointerCapture}
      />

      {/* Debug modal panel */}
      {isDebugPanelOpen && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { left: PANEL_LEFT, top: PANEL_TOP },
            width: PANEL_W,
            height: PANEL_H,
            flexDirection: 'column',
            alignItems: 'stretch',
            justifyContent: 'flex-start',
            pointerFilter: 'block'
          }}
          uiBackground={{ color: C.bg }}
        >
          {/* Title bar */}
          <UiEntity
            uiTransform={{
              width: '100%',
              height: 50,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: { left: 20, right: 12, top: 0, bottom: 0 },
              flexShrink: 0
            }}
            uiBackground={{ color: C.titleBar }}
          >
            <UiEntity
              uiTransform={{ flexShrink: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-start' }}
              uiText={{ value: 'Debug Console', fontSize: 22, color: C.white, textAlign: 'middle-left' }}
            />
            <UiEntity
              uiTransform={{
                width: 38,
                height: 30,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
                flexShrink: 0
              }}
              uiBackground={{ color: C.closeBtn }}
              uiText={{ value: 'X', fontSize: 17, color: C.white, textAlign: 'middle-center' }}
              onMouseDown={() => {
                beginUiPointerCapture()
                isDebugPanelOpen = false
              }}
              onMouseUp={endUiPointerCapture}
            />
          </UiEntity>

          {/* Global stats row */}
          <UiEntity
            uiTransform={{
              width: '100%',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: { left: 20, right: 20, top: 14, bottom: 14 },
              flexShrink: 0
            }}
          >
            <StatBox label="ECS ENTITIES" value={`${entities}`} sub="client-local" />
            <StatBox label="SERVER ZOMBIES" value={`${serverZombies}`} />
            <StatBox label="ARENA PLAYERS" value={`${arenaPlayers}`} />
            <StatBox label="ACTIVE ROOMS" value={`${activeRooms} / 4`} />
            <StatBox label="MESSAGES" value={`${msgs.received} recv`} sub={`${msgs.skipped} skip`} />
          </UiEntity>

          {/* Separator */}
          <UiEntity
            uiTransform={{ width: '100%', height: 1, flexShrink: 0 }}
            uiBackground={{ color: C.separator }}
          />

          {/* Room filter tabs */}
          <UiEntity
            uiTransform={{
              width: '100%',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-start',
              padding: { left: 20, right: 20, top: 12, bottom: 12 },
              flexShrink: 0
            }}
          >
            {(['ALL', 'R1', 'R2', 'R3', 'R4'] as const).map((label, i) => (
              <UiEntity
                uiTransform={{
                  width: i === 0 ? 58 : 48,
                  height: 30,
                  margin: { right: 10 },
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 6,
                  flexShrink: 0
                }}
                uiBackground={{ color: selectedRoom === i ? C.tabActive : C.tabInactive }}
                uiText={{
                  value: label,
                  fontSize: 14,
                  color: selectedRoom === i ? C.white : C.gray,
                  textAlign: 'middle-center'
                }}
                onMouseDown={() => {
                  beginUiPointerCapture()
                  selectedRoom = i
                }}
                onMouseUp={endUiPointerCapture}
              />
            ))}
          </UiEntity>

          {/* Separator */}
          <UiEntity
            uiTransform={{ width: '100%', height: 1, flexShrink: 0 }}
            uiBackground={{ color: C.separator }}
          />

          {/* Room data cards */}
          <UiEntity
            uiTransform={{
              width: '100%',
              flexDirection: 'column',
              alignItems: 'stretch',
              justifyContent: 'flex-start',
              padding: { left: 20, right: 20, top: 14, bottom: 14 },
              flexGrow: 1
            }}
          >
            {shownRows.map((row) => (
              <RoomCard row={row} />
            ))}
          </UiEntity>
        </UiEntity>
      )}
    </UiEntity>
  )
}
