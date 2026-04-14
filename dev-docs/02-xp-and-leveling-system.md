# XP and Leveling System Design

## What This Replaces

The current economy is: kill zombie → get 5 coins → spend coins on bricks (20 coins) or save for weapons.

The replacement: kill zombie → get XP → fill level bar → level up → choose 1 of 3 upgrades.

Coins are gone. Bricks are gone. The player's power growth is now entirely in the upgrade choices.

---

## XP Values Per Enemy Type

XP values should feel rewarding relative to how hard the enemy is to kill. Basic enemies should fill your bar noticeably but not instantly. Tank enemies — which take 10 hits — should feel like they're worth the effort.

| Enemy Type | HP | Suggested XP | Reasoning |
|---|---|---|---|
| Basic | 3 | 10 XP | Fast to kill, common. Should be bulk of XP income early. |
| Quick | 2 | 12 XP | Harder to hit (faster), slightly more valuable despite lower HP. |
| Tank | 10 | 40 XP | High effort, high reward. ~4× a basic kill. |

These are starting values, not gospel. They need tuning based on how fast leveling should feel in practice.

---

## Level Threshold Curve

The goal: players should level up **roughly once per wave** in early levels, slowing to **once every 1.5-2 waves** in later levels. This keeps upgrades feeling frequent early (exciting, lots of variety) and meaningful late (each one matters more).

Approximate threshold design for a run with 5-8 levels, 3-5 waves each:

| Player Level | XP to Next Level | Cumulative XP |
|---|---|---|
| 1 | 80 | 80 |
| 2 | 100 | 180 |
| 3 | 120 | 300 |
| 4 | 150 | 450 |
| 5 | 180 | 630 |
| 6 | 220 | 850 |
| 7 | 260 | 1110 |
| 8 | 300 | 1410 |
| 9 | 350 | 1760 |
| 10 | 400 | 2160 |
| 11–15 | +50 per level | — |
| 16–20 | +75 per level | — |
| 20+ | cap at 750 per level | — |

A wave of ~20 basic zombies yields ~200 XP. At level 1 (threshold 80), that's 2 level-ups per wave — slightly fast but exciting for the first level. By level 6 (threshold 220), one wave barely levels you up once, which feels earned.

**These numbers assume no tank or quick zombies.** Later levels with heavy tank/quick mixes will have higher XP per wave naturally.

---

## Upgrade Pool

15 upgrades total. Each upgrade can appear multiple times (stacking). Some upgrades have diminishing value on repeated picks — that's fine and expected in Archero-style runs.

### Damage Upgrades

| ID | Name | Effect per Stack |
|---|---|---|
| `atk_power` | Raw Power | +15% damage to all attacks |
| `crit_chance` | Critical Strike | +8% chance to deal 2× damage |
| `multishot` | Multishot | Fire an additional projectile (max 3 stacks → 4 total projectiles) |
| `pierce` | Piercing | Projectiles pass through 1 additional enemy per stack (max 3) |

### Survivability Upgrades

| ID | Name | Effect per Stack |
|---|---|---|
| `max_hp` | Vitality | +1 max HP |
| `heal_on_kill` | Lifesteal | Heal 1 HP every 10 kills |
| `dodge` | Dodge Roll | Add a dodge ability (if movement system supports it) |

### Speed Upgrades

| ID | Name | Effect per Stack |
|---|---|---|
| `move_speed` | Swift | +10% movement speed |
| `atk_speed` | Haste | +10% attack speed (fire rate) |

### Utility Upgrades

| ID | Name | Effect per Stack |
|---|---|---|
| `range` | Long Shot | +15% attack range |
| `xp_boost` | Scholar | +15% XP from all kills |
| `aoe_dmg` | Shockwave | Attacks deal 30% damage to enemies within 1.5m of the target |

### Special / Weapon-Linked

| ID | Name | Effect |
|---|---|---|
| `sword_sweep` | Sword Mastery | Sword hits in a 240° arc instead of 180° (sword only) |
| `shield_pulse` | Overcharge | Aura pulses every 1.5s instead of 3s (aura weapon only) |
| `ricochet` | Ricochet | Projectiles bounce to nearest enemy on hit, 1 bounce (gun family only) |

**Note:** Weapon-specific upgrades only appear in the pool if the player has that weapon. Don't show sword upgrades to a player using a gun.

---

## "Choose 3" Presentation

When the player levels up, they're presented with 3 randomly drawn upgrades from the pool. They pick 1. The other 2 are discarded for this level-up (not permanently removed from the pool — they can appear again).

**Drawing rules:**
- Draw 3 unique upgrade IDs (no duplicates in a single offer)
- Weight upgrades by: base weight × (1 / current stack count). This makes already-stacked upgrades less likely to appear again, encouraging variety.
- If the player has no sword, never draw sword-specific upgrades
- Guarantee at least 1 offensive upgrade and 1 non-offensive upgrade in every draw (prevents 3 defensive offers in a row)

**Timing — single player:**  
Level-up can trigger mid-wave. Pause enemy movement and display the upgrade UI. Resume when the player picks. This is the Archero approach and it works well — it creates brief moments of tension ("there's a tank right there and I have to pick now").

**Timing — multiplayer:**  
See `07-multiplayer-personal-progression.md`. Short answer: wave-end only, both players level-up simultaneously if both need to, each picks independently.

---

## Server Sync Schema

What the server needs to track per player:

```
PlayerRunState {
  address: string
  xp: number                          // Current XP this run
  level: number                       // Current player level this run
  upgrades: UpgradeEntry[]            // Applied upgrades with stacks
  pendingLevelUp: boolean             // Waiting for upgrade selection
  stats: ComputedStats                // Derived from upgrades (cached)
}

UpgradeEntry {
  upgradeId: string
  stacks: number
}

ComputedStats {
  atkMultiplier: number               // 1.0 = base
  fireRateMultiplier: number          // 1.0 = base
  moveSpeedMultiplier: number         // 1.0 = base
  maxHp: number                       // 5 = base
  range: number                       // 100 = base (meters)
  critChance: number                  // 0.0 = base
  xpMultiplier: number                // 1.0 = base
}
```

`ComputedStats` is recalculated server-side whenever `upgrades` changes. Clients receive the computed stats to apply locally — they don't do their own upgrade math.

**New messages needed** (in `messages.ts`):
- `playerXpGained` — server → client, tells client how much XP was just added and current total
- `playerLevelUp` — server → client, triggers the upgrade selection UI
- `playerChoseUpgrade` — client → server, sends the chosen upgrade ID
- `playerUpgradesState` — server → all clients, broadcasts updated stats after pick

---

## Stat Application

Each stat is applied as a multiplier in the relevant system:

- `atkMultiplier` → multiply base damage in hit detection code
- `fireRateMultiplier` → multiply base fire rate in weapon system (already exists as `getFireRateMultiplier()` pattern)
- `moveSpeedMultiplier` → multiply player base movement speed
- `maxHp` → override max HP in `playerHealth.ts`
- `range` → multiply `SHOOT_RANGE` in weapon systems

The key: stats should be applied from the **server-sent ComputedStats**, not calculated client-side. This prevents cheating and keeps both players in sync in multiplayer.

---

## Run Reset

When the player dies (or completes the run), all `PlayerRunState` is wiped. XP, level, and upgrades do not persist between runs. This is intentional — the appeal of roguelike-adjacent design is that every run is a fresh start.

Cross-run persistence (if desired later) should be limited to cosmetics, unlock tracking, or minor starting bonuses — not carrying over power upgrades.
