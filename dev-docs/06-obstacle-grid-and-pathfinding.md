# Obstacle Grid and Pathfinding

## The Key Insight: The Grid Already Exists

The `add-lava-system` branch contains a fully server-authoritative, client-synchronized grid system that covers the entire arena. Before we talk about pathfinding or obstacles, it's worth understanding what's already built:

**Grid dimensions:** The arena is divided into 4×4 unit tiles. Given the arena's ~44×44 unit size, this creates approximately an **11×11 grid** (121 tiles total).

**What already exists:**
- Grid coordinate system (`gridX`, `gridZ`) with world ↔ grid conversion utilities
- Server-side tile state management (which tiles are active, when they expire)
- Client-side tile rendering (show/hide/animate tiles based on server state)
- A pattern library (scatter, fissure, crater, border, sweep, safe-pocket) for placing tiles
- Network messages to sync tile states from server to all clients
- Wave-tier scaling system

This infrastructure was built for lava tiles. Repurposing it for permanent wall tiles requires adding a new tile type, not rebuilding the system.

---

## Obstacle Tiles vs Lava Tiles

The key difference between lava and walls:

| | Lava | Wall |
|---|---|---|
| Duration | Timed (activeAtMs → expiresAtMs) | Permanent for the level |
| Purpose | Damage player if standing on tile | Block enemy movement path |
| Player interaction | Hurt to stand on | Cannot walk through (or can — TBD) |
| Enemy interaction | Walk over lava (currently), take no damage | Must route around |
| Rendering | Lava GLB model | Wall/barrier GLB model |

For walls, the key is: **they are set at level load and don't change until the level ends.** They're static level geometry, not dynamic hazards.

---

## Adding Wall Tile Support to the Grid System

The current tile state has these fields (from `lavaHazardConfig.ts`):
```typescript
type LavaHazardTileState = {
  lavaId: string
  gridX: number
  gridZ: number
  warningAtMs: number
  activeAtMs: number
  expiresAtMs: number
  ...
}
```

The simplest approach: add a separate wall tile system alongside the lava system, sharing the same grid coordinate space. Wall tiles are just a `Set<string>` of tile keys that are occupied by obstacles.

```typescript
// Server-side, per level
type WallLayout = {
  tiles: Set<string>  // Set of getLavaTileKey(gridX, gridZ) values
}
```

On the client, the wall layout is received once at level load. Tiles in the wall set render wall GLB models (instead of lava). They're static — no animation, no expiry, no warning state.

**Coexistence with lava:** The lava system doesn't need to know about walls. The only rule: don't spawn lava on wall tiles. This is a single bounds check in `lavaHazardPatterns.ts` when generating patterns.

---

## Pathfinding: A* on the 11×11 Grid

### Why A* on the Grid (Not NavMesh)

DCL SDK 7 has no built-in NavMesh. Building one from scratch is significant engineering work. But we don't need NavMesh — we already have a grid.

A* pathfinding on an 11×11 grid:
- 121 nodes total
- A* worst case: ~60-80 node evaluations per path query
- At 60 FPS, computing 10 simultaneous paths per frame takes microseconds
- This is **not a performance concern at this scale**

### How Pathfinding Works

1. At level load, build a **walkability map** from the wall layout:
   ```
   walkable[gridX][gridZ] = !isWall(gridX, gridZ)
   ```

2. When a zombie needs to move to a target, run A* from its current grid cell to the target's grid cell.

3. The A* result is a list of grid waypoints (e.g., `[(2,3), (2,4), (3,4), (4,4)]`).

4. The zombie follows these waypoints in order, moving smoothly from center to center of each tile.

5. Path is recalculated when:
   - The zombie reaches a waypoint (advance to next)
   - The target's grid cell changes (player moves to different tile)
   - At most every 0.5 seconds (don't recalculate every frame)

### Grid-to-World and World-to-Grid

These utility functions already exist in `lavaHazardConfig.ts`:
```typescript
getLavaWorldPosition(gridX, gridZ) → Vector3
getLavaGridCoordsFromWorld(posX, posZ) → { gridX, gridZ } | null
```

Pathfinding uses these to convert between the grid coordinate system and world positions.

### Diagonal Movement

Allow diagonal movement (8-directional A*) for smoother enemy pathing. Weight diagonal moves as √2 ≈ 1.414 (standard A* Euclidean cost). This prevents enemies from looking unnatural when navigating around corners.

---

## Changes to `zombie.ts`

The current movement logic in `zombie.ts` is roughly:

```typescript
// Current: every frame during WALKING state
const direction = normalize(targetPosition - zombiePosition)
zombiePosition += direction * speed * dt
```

The new movement logic:

```typescript
// New: path-following
if (path.length === 0 || shouldRecalculate()) {
  path = computeAStarPath(zombieGridPos, targetGridPos, walkabilityMap)
}

const nextWaypoint = getWorldCenter(path[0])
const direction = normalize(nextWaypoint - zombiePosition)
zombiePosition += direction * speed * dt

if (distance(zombiePosition, nextWaypoint) < 0.3) {
  path.shift()  // reached waypoint, advance to next
}
```

The rest of the zombie system (SPAWNING, ATTACKING, damage, animation, death) is unchanged. Only the WALKING movement logic changes.

**Brick collision:** The current brick-collision code (revert position if colliding with brick) can be removed once A* is handling obstacle avoidance. Bricks would simply be marked as wall tiles in the grid.

---

## Pre-Authored Obstacle Layouts

Each level has a defined wall layout specified as a list of grid coordinates. These layouts are authored manually (or with a layout editor if one is built later) and stored in `levelConfig.ts`.

The pattern system in `lavaHazardPatterns.ts` (scatter, fissure, crater, etc.) can be **adapted** for wall layout authoring — but wall layouts are static, so patterns are applied at design time and stored, not generated procedurally at runtime.

### Example Layouts

**Level 2 — Scattered Pillars**
```typescript
// 6 single-tile pillars distributed around the arena
tiles: [
  { gridX: 2, gridZ: 2 }, { gridX: 8, gridZ: 2 },
  { gridX: 5, gridZ: 5 },
  { gridX: 2, gridZ: 8 }, { gridX: 8, gridZ: 8 },
  { gridX: 5, gridZ: 9 },
]
```

**Level 3 — Corridors**
```typescript
// Two horizontal wall segments creating corridors
tiles: [
  // Left wall segment (4 tiles)
  { gridX: 1, gridZ: 4 }, { gridX: 2, gridZ: 4 }, { gridX: 3, gridZ: 4 }, { gridX: 4, gridZ: 4 },
  // Right wall segment (4 tiles)
  { gridX: 6, gridZ: 6 }, { gridX: 7, gridZ: 6 }, { gridX: 8, gridZ: 6 }, { gridX: 9, gridZ: 6 },
]
```

Each layout needs to be tested to ensure:
- There is always a valid path from any spawn position to the center of the arena (no fully blocked zones)
- The paths create interesting strategic choices (chokepoints, flanking routes)
- Players can't get trapped by the layout

### Validating Layouts

Before a level is playable, run a pathfinding check: can an enemy at each spawn corner reach the arena center? If not, the layout has disconnected zones and needs adjusting. This check can be a simple offline tool, not runtime code.

---

## Player and Wall Collision

**Question:** Can the player walk through walls, or do walls block players too?

**Two options:**

**Option A: Walls block enemies only, players pass through**
- Simpler to implement (no player collision detection changes)
- Creates an asymmetry: players can cross walls but enemies have to route around
- Could feel unfair ("why can't the enemy come through here?") or strategic ("I can kite through walls")
- Archero doesn't have traversable walls for reference

**Option B: Walls block everyone**
- Requires adding player-wall collision detection (new code — DCL doesn't do this automatically)
- Makes obstacle layout design meaningful for both enemies and players
- Richer strategic possibilities

**Recommendation:** Option B for the full vision, Option A for MVP. Player-wall collision can be added in a second pass once the obstacle and pathfinding system is working.

For Option B, player collision would use the same grid lookup: if the player's intended next position is in a wall tile, block the movement. This is the same logic as the current brick collision for zombies.

---

## Models for Wall Tiles

The lava system uses 3 GLB models (`lava.glb`, `lava_02.glb`, `lava_03.glb`). Wall tiles need their own model set.

Potential wall tile types:
- Concrete/stone walls (most neutral aesthetically)
- Ruined building fragments (fits zombie apocalypse theme)
- Energy barriers (sci-fi feel, easier to animate a glowing effect)

The tile rendering code in `lavaHazard.ts` is GLB-source agnostic — you just swap the model path. No code changes needed for this.

**Note:** Wall tile models need to be sized to fit the 4×4 unit tile exactly and sit flush at ground level. The scale system from the lava tiles (`LAVA_TILE_SCALE_XZ = 4`) applies directly.

---

## Lava + Walls Coexistence

Both systems can run simultaneously in later levels. Rules:

1. Wall tiles are marked first at level load
2. Lava pattern generation skips wall tiles (add a `!isWall(gridX, gridZ)` check in `addTile()`)
3. Pathfinding treats wall tiles as impassable (obviously)
4. Lava tiles are dangerous-to-stand-on but not pathfinding obstacles (enemies walk over lava — they're zombies, they don't care)

This creates level design possibilities: the lava can chase players through narrow corridors defined by the wall layout. That's interesting.
