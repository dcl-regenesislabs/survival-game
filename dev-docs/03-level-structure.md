# Level and Wave Structure Design

## The Problem with Endless Waves

The current system has 100 waves scaling exponentially. This sounds like a lot of content, but in practice every wave is the same experience — the same arena, the same enemies (just more of them), the same flat open space. The only thing that changes is enemy count and composition.

Players have no sense of progression other than a number going up. There's no arc, no landmarks, no sense of "I've made it somewhere."

---

## What a Level Is

A **level** is a self-contained stage with:
- A fixed number of waves (3-5)
- A defined enemy composition (which types appear, in what ratios)
- An obstacle layout (which grid tiles are walls or terrain features)
- A lava hazard tier (how aggressive the lava patterns are)
- A clear end condition (all waves cleared = level complete)

Levels are played sequentially. Completing level 1 unlocks level 2. Death during a level sends you back to the start of that level (or the start of the run — design choice, see below).

---

## Proposed Level Structure (First Pass)

This is a starting point, not a final design. Numbers are placeholders to be tuned.

### Level 1 — The Open Field
> Introduction. No obstacles. No lava. Just learn to shoot and move.

- **Waves:** 3
- **Enemies:** Basic zombies only (5 / 7 / 10)
- **Obstacles:** None
- **Lava:** None
- **New mechanic introduced:** XP, level-up, choose upgrade
- **Notes:** This is the tutorial level in disguise. Keep it forgiving.

---

### Level 2 — The Pillars
> First environmental change. Scattered pillars create cover and chokepoints.

- **Waves:** 3
- **Enemies:** Basic + Quick (75% / 25%, 8 / 12 / 16 total)
- **Obstacles:** Scattered pillar layout (6-8 single-tile pillars distributed around arena)
- **Lava:** Mild (scatter pattern, tier 1)
- **New mechanic introduced:** Obstacles, basic lava

---

### Level 3 — The Corridor
> Enemies now have to route around walls. Players learn to funnel enemies.

- **Waves:** 4
- **Enemies:** Basic + Quick + early Tank (60% / 30% / 10%, 10 / 14 / 18 / 22 total)
- **Obstacles:** Two parallel wall segments creating corridors through the arena
- **Lava:** Moderate (sweep or fissure patterns, tier 2)
- **New mechanic introduced:** Tank enemies, corridor-funneling strategy

---

### Level 4 — The Maze
> Dense obstacle layout with real pathfinding pressure. Enemies navigate complex routes.

- **Waves:** 4
- **Enemies:** Mixed heavy (40% Basic / 35% Quick / 25% Tank, 14 / 18 / 22 / 26 total)
- **Obstacles:** U-shaped walls and partial corridors, multiple paths through arena
- **Lava:** Aggressive (crater + border patterns, tier 3)
- **New mechanic introduced:** Dense obstacle navigation, high-pressure lava

---

### Level 5 — The Gauntlet (Final Level for MVP)
> Maximum pressure. Large enemy counts, dense obstacles, aggressive lava, no safe zones.

- **Waves:** 5
- **Enemies:** Heavy late-game mix (30% Basic / 40% Quick / 30% Tank, 20 / 24 / 28 / 32 / 36 total)
- **Obstacles:** Asymmetric layout, no clean line of sight across the arena
- **Lava:** Max tier (all pattern types active, safe-pocket patterns to avoid total coverage)
- **New mechanic introduced:** (If shooter enemies exist) First appearance of shooters in final waves

---

## Wave Design Principles

Each wave within a level follows these rules:

1. **Spawn count scales within the level.** Wave 1 of a level is always lighter than wave 3 or 4. This gives players a breather at level start.
2. **New enemy types enter mid-level, not wave 1.** Don't introduce the tank on wave 1 of level 3 — introduce it on wave 2 or 3, after the player has had a chance to settle.
3. **Wave spacing stays consistent.** 30 seconds combat, 30 seconds rest (current values). The rest phase is when level-up UI is triggered if the player leveled up during the wave.

---

## How This Maps to Existing Code

The existing `waveManager.ts` has `buildSpawnSchedule()` which takes a wave number and returns spawn timing. This function can be reused almost unchanged — it just needs to accept the wave's enemy composition as a parameter rather than calculating it from the wave number.

**What changes:**

```
Current outer loop:
  waveNumber = 1..100
  composition = calculateCompositionForWave(waveNumber)  ← remove this
  schedule = buildSpawnSchedule(waveNumber)

New outer loop:
  currentLevel = levels[levelIndex]
  for waveIndex in currentLevel.waves:
    waveConfig = currentLevel.waves[waveIndex]  ← new: level config drives composition
    schedule = buildSpawnSchedule(waveConfig)
```

The state machine stays the same (`idle → countdown → fighting → wave_complete`). A new state is added: `level_complete` (all waves in current level cleared).

**Server additions:**
- `currentLevelIndex` on match state
- `currentLevelWaveIndex` on match state (which wave within the level)
- `levelComplete` event message
- `runComplete` event message (all levels cleared)

---

## Level Config Schema

Levels should be defined as config objects, not hardcoded logic. This makes it easy to add, reorder, or tune levels without touching the game logic.

```typescript
type WaveConfig = {
  totalEnemies: number
  composition: {
    basic: number    // fraction 0-1
    quick: number
    tank: number
  }
}

type ObstacleLayout = {
  tiles: Array<{ gridX: number, gridZ: number }>  // which grid tiles are walls
}

type LevelConfig = {
  id: string
  name: string
  waves: WaveConfig[]
  obstacleLayout: ObstacleLayout
  lavaHazardTier: 0 | 1 | 2 | 3 | 4  // 0 = no lava
}

const LEVELS: LevelConfig[] = [
  // level 1, 2, 3... defined here
]
```

This lives in a new file: `src/shared/levelConfig.ts`.

---

## Death and Restart Design

Two options:

**Option A: Die on level → restart that level**
- More forgiving. Players don't lose the whole run.
- Risk: some players will just replay level 3 over and over if they die on level 4. Diminishes stakes.
- Upgrades persist between level attempts? If yes, players can grind. If no, they restart leveling from scratch each attempt — frustrating.

**Option B: Die anywhere → restart the full run**
- True roguelite. Every run is a fresh start.
- Higher stakes on upgrade choices.
- Risk: frustrating for casual players if level 1 takes 3 minutes to clear and dying on level 4 means redoing all of it.

**Recommended for MVP:** Option A (restart level) with upgrades also reset on level restart. This is a middle ground — you don't lose the whole run, but you lose your upgrades for the level and have to rebuild. Stakes exist without being brutal.

This decision should be validated with actual playtesting before committing either way.

---

## Level Completion Flow

1. Last zombie of last wave dies
2. `level_complete` event fires
3. Brief celebration animation/screen (2-3 seconds)
4. If more levels remain: obstacle layout changes, lava tier updates, short countdown, next level begins
5. If final level cleared: `run_complete` screen, show stats, return to lobby

**Between levels:** This is when weapon swapping (if weapon drops exist) and bonus upgrade picks happen. Not mid-wave.

---

## Content Scope Warning

5 levels × 4 waves = 20 wave configurations to design and tune. That's real content work. Each obstacle layout needs to be tested with the pathfinding system to make sure enemies actually navigate it in interesting ways (not just getting stuck or finding a trivially easy path).

Don't design all 8 levels upfront. Build 3, playtest extensively, then add more.
