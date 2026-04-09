import {
  LAVA_GRID_SIZE_X,
  LAVA_GRID_SIZE_Z,
  LAVA_MODEL_SRCS,
  LAVA_SAFE_ZONE_ACTIVE_MS,
  LAVA_STATIC_ACTIVE_MS,
  LAVA_SWEEP_ACTIVE_MS,
  LAVA_SWEEP_STEP_INTERVAL_MS,
  LAVA_SWEEP_WARNING_MS,
  LAVA_WARNING_DURATION_MS,
  getLavaTileKey,
  getLavaWaveTier,
  isLavaGridInBounds,
  type LavaHazardTileState
} from '../shared/lavaHazardConfig'

type TileTiming = {
  gridX: number
  gridZ: number
  warningAtMs: number
  activeAtMs: number
  expiresAtMs: number
}

type TimingWindow = {
  warningAtMs: number
  activeAtMs: number
  expiresAtMs: number
}

type TileCollection = Map<string, TileTiming>
type LavaPatternKind = 'scatter' | 'fissure' | 'crater' | 'border' | 'sweep' | 'safe-pocket'
type EventSlot = {
  delayMinMs: number
  delayMaxMs: number
  patterns: LavaPatternKind[]
}

const MAX_GRID_X = LAVA_GRID_SIZE_X - 1
const MAX_GRID_Z = LAVA_GRID_SIZE_Z - 1

let lastPrimaryPattern: LavaPatternKind | null = null

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

function pickRandom<T>(values: T[]): T {
  return values[Math.floor(Math.random() * values.length)]
}

function clampGridX(value: number): number {
  return Math.max(0, Math.min(MAX_GRID_X, value))
}

function clampGridZ(value: number): number {
  return Math.max(0, Math.min(MAX_GRID_Z, value))
}

function addTile(tiles: TileCollection, timing: TileTiming): void {
  if (!isLavaGridInBounds(timing.gridX, timing.gridZ)) return

  const key = getLavaTileKey(timing.gridX, timing.gridZ)
  const existing = tiles.get(key)
  if (!existing) {
    tiles.set(key, timing)
    return
  }

  existing.warningAtMs = Math.min(existing.warningAtMs, timing.warningAtMs)
  existing.activeAtMs = Math.min(existing.activeAtMs, timing.activeAtMs)
  existing.expiresAtMs = Math.max(existing.expiresAtMs, timing.expiresAtMs)
}

function addBlob(
  tiles: TileCollection,
  centerX: number,
  centerZ: number,
  radiusX: number,
  radiusZ: number,
  timing: TimingWindow
): void {
  for (let gridX = 0; gridX < LAVA_GRID_SIZE_X; gridX += 1) {
    for (let gridZ = 0; gridZ < LAVA_GRID_SIZE_Z; gridZ += 1) {
      const normalizedX = (gridX - centerX) / Math.max(0.75, radiusX)
      const normalizedZ = (gridZ - centerZ) / Math.max(0.75, radiusZ)
      const distance = Math.sqrt(normalizedX * normalizedX + normalizedZ * normalizedZ)
      const edgeNoise = (Math.random() - 0.5) * 0.28
      if (distance > 1 + edgeNoise) continue

      addTile(tiles, {
        gridX,
        gridZ,
        warningAtMs: timing.warningAtMs,
        activeAtMs: timing.activeAtMs,
        expiresAtMs: timing.expiresAtMs
      })
    }
  }
}

function addInvertedSafeBlob(
  tiles: TileCollection,
  centerX: number,
  centerZ: number,
  radiusX: number,
  radiusZ: number,
  timing: TimingWindow
): void {
  for (let gridX = 0; gridX < LAVA_GRID_SIZE_X; gridX += 1) {
    for (let gridZ = 0; gridZ < LAVA_GRID_SIZE_Z; gridZ += 1) {
      const normalizedX = (gridX - centerX) / Math.max(0.75, radiusX)
      const normalizedZ = (gridZ - centerZ) / Math.max(0.75, radiusZ)
      const distance = Math.sqrt(normalizedX * normalizedX + normalizedZ * normalizedZ)
      const safeNoise = (Math.random() - 0.5) * 0.2
      if (distance <= 1 + safeNoise) continue

      addTile(tiles, {
        gridX,
        gridZ,
        warningAtMs: timing.warningAtMs,
        activeAtMs: timing.activeAtMs,
        expiresAtMs: timing.expiresAtMs
      })
    }
  }
}

function addBorder(
  tiles: TileCollection,
  depth: number,
  timing: TimingWindow
): void {
  for (let layer = 0; layer < depth; layer += 1) {
    const minX = layer
    const maxX = MAX_GRID_X - layer
    const minZ = layer
    const maxZ = MAX_GRID_Z - layer

    if (minX > maxX || minZ > maxZ) break

    for (let gridX = minX; gridX <= maxX; gridX += 1) {
      addTile(tiles, {
        gridX,
        gridZ: minZ,
        warningAtMs: timing.warningAtMs,
        activeAtMs: timing.activeAtMs,
        expiresAtMs: timing.expiresAtMs
      })
      addTile(tiles, {
        gridX,
        gridZ: maxZ,
        warningAtMs: timing.warningAtMs,
        activeAtMs: timing.activeAtMs,
        expiresAtMs: timing.expiresAtMs
      })
    }

    for (let gridZ = minZ; gridZ <= maxZ; gridZ += 1) {
      addTile(tiles, {
        gridX: minX,
        gridZ,
        warningAtMs: timing.warningAtMs,
        activeAtMs: timing.activeAtMs,
        expiresAtMs: timing.expiresAtMs
      })
      addTile(tiles, {
        gridX: maxX,
        gridZ,
        warningAtMs: timing.warningAtMs,
        activeAtMs: timing.activeAtMs,
        expiresAtMs: timing.expiresAtMs
      })
    }
  }
}

function addFissurePath(
  tiles: TileCollection,
  timing: TimingWindow,
  horizontal: boolean,
  reversed: boolean,
  anchor: number,
  branchChance: number,
  width: number
): void {
  let gridX = horizontal ? (reversed ? MAX_GRID_X : 0) : clampGridX(anchor + randomInt(-1, 1))
  let gridZ = horizontal ? clampGridZ(anchor + randomInt(-1, 1)) : (reversed ? MAX_GRID_Z : 0)

  while (isLavaGridInBounds(gridX, gridZ)) {
    addTile(tiles, {
      gridX,
      gridZ,
      warningAtMs: timing.warningAtMs,
      activeAtMs: timing.activeAtMs,
      expiresAtMs: timing.expiresAtMs
    })

    if (width > 1) {
      if (horizontal) {
        addTile(tiles, {
          gridX,
          gridZ: clampGridZ(gridZ + pickRandom([-1, 1])),
          warningAtMs: timing.warningAtMs,
          activeAtMs: timing.activeAtMs,
          expiresAtMs: timing.expiresAtMs
        })
      } else {
        addTile(tiles, {
          gridX: clampGridX(gridX + pickRandom([-1, 1])),
          gridZ,
          warningAtMs: timing.warningAtMs,
          activeAtMs: timing.activeAtMs,
          expiresAtMs: timing.expiresAtMs
        })
      }
    }

    if (Math.random() < branchChance) {
      if (horizontal) {
        addTile(tiles, {
          gridX,
          gridZ: clampGridZ(gridZ + pickRandom([-1, 1])),
          warningAtMs: timing.warningAtMs,
          activeAtMs: timing.activeAtMs,
          expiresAtMs: timing.expiresAtMs
        })
      } else {
        addTile(tiles, {
          gridX: clampGridX(gridX + pickRandom([-1, 1])),
          gridZ,
          warningAtMs: timing.warningAtMs,
          activeAtMs: timing.activeAtMs,
          expiresAtMs: timing.expiresAtMs
        })
      }
    }

    if (horizontal) {
      gridX += reversed ? -1 : 1
      if (Math.random() < 0.7) gridZ = clampGridZ(gridZ + randomInt(-1, 1))
    } else {
      gridZ += reversed ? -1 : 1
      if (Math.random() < 0.7) gridX = clampGridX(gridX + randomInt(-1, 1))
    }
  }
}

function canPlaceScatteredSquare(usedKeys: Set<string>, centerX: number, centerZ: number, minSpacing: number): boolean {
  for (let gridX = centerX - minSpacing; gridX <= centerX + minSpacing; gridX += 1) {
    for (let gridZ = centerZ - minSpacing; gridZ <= centerZ + minSpacing; gridZ += 1) {
      if (usedKeys.has(getLavaTileKey(gridX, gridZ))) {
        return false
      }
    }
  }
  return true
}

function buildScatterPattern(waveNumber: number, waveStartAtMs: number, slot: EventSlot): TileCollection {
  const tiles: TileCollection = new Map()
  const timing = buildTiming(
    waveNumber,
    waveStartAtMs,
    slot,
    Math.max(4200, getStaticActiveDurationMs(waveNumber) - 1400),
    getStaticWarningDurationMs(waveNumber)
  )
  const minSpacing = waveNumber === 1 ? 2 : 1
  const squareCount = waveNumber === 1 ? 4 : waveNumber === 2 ? 5 : 6
  const usedCenters = new Set<string>()
  let attempts = 0

  while (usedCenters.size < squareCount && attempts < 120) {
    attempts += 1
    const centerX = randomInt(1, MAX_GRID_X - 1)
    const centerZ = randomInt(1, MAX_GRID_Z - 1)
    if (!canPlaceScatteredSquare(usedCenters, centerX, centerZ, minSpacing)) continue
    usedCenters.add(getLavaTileKey(centerX, centerZ))

    addTile(tiles, {
      gridX: centerX,
      gridZ: centerZ,
      warningAtMs: timing.warningAtMs,
      activeAtMs: timing.activeAtMs,
      expiresAtMs: timing.expiresAtMs
    })
  }

  return tiles
}

function getStaticWarningDurationMs(waveNumber: number): number {
  if (waveNumber >= 16) return 950
  if (waveNumber >= 10) return 1100
  return LAVA_WARNING_DURATION_MS
}

function getStaticActiveDurationMs(waveNumber: number): number {
  if (waveNumber >= 16) return LAVA_STATIC_ACTIVE_MS + 900
  if (waveNumber >= 10) return LAVA_STATIC_ACTIVE_MS + 250
  if (waveNumber >= 7) return LAVA_STATIC_ACTIVE_MS - 250
  return LAVA_STATIC_ACTIVE_MS - 600
}

function getSafePocketActiveDurationMs(waveNumber: number): number {
  if (waveNumber >= 16) return LAVA_SAFE_ZONE_ACTIVE_MS + 600
  return LAVA_SAFE_ZONE_ACTIVE_MS
}

function getSweepWarningDurationMs(waveNumber: number): number {
  if (waveNumber >= 16) return 700
  if (waveNumber >= 10) return 760
  return LAVA_SWEEP_WARNING_MS
}

function getSweepStepIntervalMs(waveNumber: number): number {
  if (waveNumber >= 16) return 180
  if (waveNumber >= 13) return 210
  if (waveNumber >= 10) return 230
  return LAVA_SWEEP_STEP_INTERVAL_MS
}

function getSweepActiveDurationMs(waveNumber: number): number {
  if (waveNumber >= 16) return LAVA_SWEEP_ACTIVE_MS + 250
  if (waveNumber >= 10) return LAVA_SWEEP_ACTIVE_MS + 100
  return LAVA_SWEEP_ACTIVE_MS
}

function buildTiming(
  waveNumber: number,
  waveStartAtMs: number,
  slot: EventSlot,
  activeDurationMs: number,
  warningDurationMs: number
): TimingWindow {
  const warningAtMs = waveStartAtMs + randomInt(slot.delayMinMs, slot.delayMaxMs)
  const activeAtMs = warningAtMs + warningDurationMs
  return {
    warningAtMs,
    activeAtMs,
    expiresAtMs: activeAtMs + activeDurationMs
  }
}

function buildFissurePattern(waveNumber: number, waveStartAtMs: number, slot: EventSlot): TileCollection {
  const tiles: TileCollection = new Map()
  const tier = getLavaWaveTier(waveNumber)
  const timing = buildTiming(
    waveNumber,
    waveStartAtMs,
    slot,
    getStaticActiveDurationMs(waveNumber),
    getStaticWarningDurationMs(waveNumber)
  )
  const fissureCount = waveNumber >= 16 ? randomInt(2, 3) : waveNumber >= 10 ? 2 : waveNumber >= 7 ? randomInt(1, 2) : 1
  const branchChance = tier >= 4 ? 0.35 : tier >= 3 ? 0.22 : tier >= 2 ? 0.15 : 0.08
  const width = waveNumber >= 16 ? 2 : waveNumber >= 13 && Math.random() < 0.45 ? 2 : 1

  for (let index = 0; index < fissureCount; index += 1) {
    addFissurePath(
      tiles,
      timing,
      Math.random() < 0.5,
      Math.random() < 0.5,
      randomInt(1, Math.min(MAX_GRID_X, MAX_GRID_Z) - 1),
      branchChance,
      width
    )
  }

  return tiles
}

function buildCraterPattern(waveNumber: number, waveStartAtMs: number, slot: EventSlot): TileCollection {
  const tiles: TileCollection = new Map()
  const timing = buildTiming(
    waveNumber,
    waveStartAtMs,
    slot,
    getStaticActiveDurationMs(waveNumber),
    getStaticWarningDurationMs(waveNumber)
  )
  const craterCount = waveNumber >= 13 ? 2 : waveNumber >= 8 ? randomInt(1, 2) : 1

  for (let index = 0; index < craterCount; index += 1) {
    addBlob(
      tiles,
      randomFloat(1.5, MAX_GRID_X - 1.5),
      randomFloat(1.5, MAX_GRID_Z - 1.5),
      waveNumber >= 13 ? randomFloat(2.2, 3.0) : waveNumber >= 8 ? randomFloat(1.8, 2.5) : randomFloat(1.5, 2.1),
      waveNumber >= 13 ? randomFloat(2.2, 3.0) : waveNumber >= 8 ? randomFloat(1.8, 2.5) : randomFloat(1.5, 2.1),
      timing
    )
  }

  return tiles
}

function buildBorderPattern(waveNumber: number, waveStartAtMs: number, slot: EventSlot): TileCollection {
  const tiles: TileCollection = new Map()
  const timing = buildTiming(
    waveNumber,
    waveStartAtMs,
    slot,
    getStaticActiveDurationMs(waveNumber),
    getStaticWarningDurationMs(waveNumber)
  )
  const depth = waveNumber >= 18 ? 3 : waveNumber >= 10 ? randomInt(1, 2) : 1
  addBorder(tiles, depth, timing)
  return tiles
}

function buildSafePocketPattern(waveNumber: number, waveStartAtMs: number, slot: EventSlot): TileCollection {
  const tiles: TileCollection = new Map()
  const timing = buildTiming(
    waveNumber,
    waveStartAtMs,
    slot,
    getSafePocketActiveDurationMs(waveNumber),
    getStaticWarningDurationMs(waveNumber)
  )
  const radiusX = waveNumber >= 18 ? randomFloat(2.4, 2.9) : waveNumber >= 16 ? randomFloat(2.8, 3.3) : randomFloat(3.2, 3.8)
  const radiusZ = waveNumber >= 18 ? randomFloat(2.4, 2.9) : waveNumber >= 16 ? randomFloat(2.8, 3.3) : randomFloat(3.2, 3.8)
  const marginX = Math.ceil(radiusX) + 1
  const marginZ = Math.ceil(radiusZ) + 1

  addInvertedSafeBlob(
    tiles,
    randomFloat(marginX, MAX_GRID_X - marginX),
    randomFloat(marginZ, MAX_GRID_Z - marginZ),
    radiusX,
    radiusZ,
    timing
  )

  return tiles
}

function addSweepPass(
  tiles: TileCollection,
  waveStartAtMs: number,
  slot: EventSlot,
  horizontal: boolean,
  reversed: boolean,
  laneWidth: number,
  warningDurationMs: number,
  stepIntervalMs: number,
  activeDurationMs: number
): void {
  const laneStarts: number[] = []
  const maxStart = horizontal ? MAX_GRID_Z : MAX_GRID_X

  if (reversed) {
    for (let laneStart = maxStart - laneWidth + 1; laneStart >= 0; laneStart -= laneWidth) {
      laneStarts.push(laneStart)
    }
  } else {
    for (let laneStart = 0; laneStart <= maxStart; laneStart += laneWidth) {
      laneStarts.push(laneStart)
    }
  }

  const baseDelayMs = randomInt(slot.delayMinMs, slot.delayMaxMs)

  laneStarts.forEach((laneStart, index) => {
    const warningAtMs = waveStartAtMs + baseDelayMs + index * stepIntervalMs
    const activeAtMs = warningAtMs + warningDurationMs
    const expiresAtMs = activeAtMs + activeDurationMs

    if (horizontal) {
      for (let gridX = 0; gridX < LAVA_GRID_SIZE_X; gridX += 1) {
        for (let widthOffset = 0; widthOffset < laneWidth; widthOffset += 1) {
          addTile(tiles, {
            gridX,
            gridZ: laneStart + widthOffset,
            warningAtMs,
            activeAtMs,
            expiresAtMs
          })
        }
      }
      return
    }

    for (let gridZ = 0; gridZ < LAVA_GRID_SIZE_Z; gridZ += 1) {
      for (let widthOffset = 0; widthOffset < laneWidth; widthOffset += 1) {
        addTile(tiles, {
          gridX: laneStart + widthOffset,
          gridZ,
          warningAtMs,
          activeAtMs,
          expiresAtMs
        })
      }
    }
  })
}

function buildSweepPattern(waveNumber: number, waveStartAtMs: number, slot: EventSlot): TileCollection {
  const tiles: TileCollection = new Map()
  const laneWidth = waveNumber >= 18 ? randomInt(2, 3) : waveNumber >= 13 ? 2 : 1
  addSweepPass(
    tiles,
    waveStartAtMs,
    slot,
    Math.random() < 0.5,
    Math.random() < 0.5,
    laneWidth,
    getSweepWarningDurationMs(waveNumber),
    getSweepStepIntervalMs(waveNumber),
    getSweepActiveDurationMs(waveNumber)
  )
  return tiles
}

function getWavePlan(waveNumber: number): EventSlot[] {
  if (waveNumber <= 3) {
    return [
      { delayMinMs: 4200, delayMaxMs: 6200, patterns: ['scatter'] }
    ]
  }

  if (waveNumber <= 6) {
    return [
      { delayMinMs: 4000, delayMaxMs: 6000, patterns: ['fissure', 'fissure', 'crater'] }
    ]
  }

  if (waveNumber <= 9) {
    const slots: EventSlot[] = [
      { delayMinMs: 4000, delayMaxMs: 6000, patterns: ['fissure', 'crater', 'border'] }
    ]
    if (waveNumber >= 8) {
      slots.push({ delayMinMs: 15500, delayMaxMs: 17500, patterns: ['crater', 'border', 'fissure'] })
    }
    return slots
  }

  if (waveNumber <= 12) {
    return [
      { delayMinMs: 4000, delayMaxMs: 5800, patterns: ['crater', 'border', 'fissure'] },
      { delayMinMs: 15800, delayMaxMs: 18200, patterns: ['sweep', 'crater', 'border'] }
    ]
  }

  if (waveNumber <= 15) {
    return [
      { delayMinMs: 3800, delayMaxMs: 5400, patterns: ['border', 'crater', 'sweep'] },
      { delayMinMs: 16800, delayMaxMs: 18800, patterns: ['safe-pocket', 'border', 'sweep'] }
    ]
  }

  return [
    { delayMinMs: 3500, delayMaxMs: 5000, patterns: ['border', 'crater', 'sweep'] },
    { delayMinMs: 12000, delayMaxMs: 14000, patterns: ['sweep', 'border', 'crater'] },
    { delayMinMs: 19500, delayMaxMs: 20500, patterns: ['safe-pocket', 'sweep', 'border'] }
  ]
}

function pickPatternKind(
  patterns: LavaPatternKind[],
  previousPatternInWave: LavaPatternKind | null,
  avoidPrimaryRepeat: boolean
): LavaPatternKind {
  const forbidden = new Set<LavaPatternKind>()
  if (previousPatternInWave) forbidden.add(previousPatternInWave)
  if (avoidPrimaryRepeat && lastPrimaryPattern) forbidden.add(lastPrimaryPattern)

  const filtered = patterns.filter((pattern) => !forbidden.has(pattern))
  if (filtered.length > 0) return pickRandom(filtered)
  return pickRandom(patterns)
}

function buildPatternTiles(
  pattern: LavaPatternKind,
  waveNumber: number,
  waveStartAtMs: number,
  slot: EventSlot
): TileCollection {
  if (pattern === 'scatter') return buildScatterPattern(waveNumber, waveStartAtMs, slot)
  if (pattern === 'crater') return buildCraterPattern(waveNumber, waveStartAtMs, slot)
  if (pattern === 'border') return buildBorderPattern(waveNumber, waveStartAtMs, slot)
  if (pattern === 'safe-pocket') return buildSafePocketPattern(waveNumber, waveStartAtMs, slot)
  if (pattern === 'sweep') return buildSweepPattern(waveNumber, waveStartAtMs, slot)
  return buildFissurePattern(waveNumber, waveStartAtMs, slot)
}

export function buildLavaHazardsForWave(
  waveNumber: number,
  waveStartAtMs: number,
  getNextLavaId: () => string
): LavaHazardTileState[] {
  const slots = getWavePlan(waveNumber)
  const hazards: LavaHazardTileState[] = []
  let previousPatternInWave: LavaPatternKind | null = null

  slots.forEach((slot, index) => {
    const pattern = pickPatternKind(slot.patterns, previousPatternInWave, index === 0)
    const tiles = buildPatternTiles(pattern, waveNumber, waveStartAtMs, slot)
    previousPatternInWave = pattern
    if (index === 0) lastPrimaryPattern = pattern

    for (const tile of tiles.values()) {
      hazards.push({
        lavaId: getNextLavaId(),
        gridX: tile.gridX,
        gridZ: tile.gridZ,
        modelVariant: randomInt(0, LAVA_MODEL_SRCS.length - 1),
        rotationQuarterTurns: 0,
        warningAtMs: tile.warningAtMs,
        activeAtMs: tile.activeAtMs,
        expiresAtMs: tile.expiresAtMs
      })
    }
  })

  return hazards
}
