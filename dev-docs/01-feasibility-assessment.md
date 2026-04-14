# Feasibility Assessment: Archero-Like Pivot

## How to Read This Document

Each system is assessed on:
- **Effort**: How much work is this, realistically?
- **Risk**: What could go wrong or turn out to be harder than expected?
- **Foundation**: What already exists that helps?
- **Verdict**: Is this a good idea to tackle?

Effort ratings: Easy (< 1 day) / Moderate (2-4 days) / Hard (1-2 weeks) / Very Hard (2+ weeks)

---

## Current Codebase State

Before assessing individual features, here's the honest baseline:

**Strengths:**
- Small codebase (~3,600 LOC across 17 files). Easy to hold in your head.
- Server-authoritative multiplayer is already in place. This is the hardest thing to add from scratch, and it's done.
- The lava system (on the `add-lava-system` branch) is a fully server-synced, client-rendered grid system. This is foundational for the obstacle design.
- The wave system is well-documented and mathematically sound.
- Enemy AI state machine is clean and extensible.

**Weaknesses:**
- The 3 weapon files (gun.ts, shotgun.ts, minigun.ts) are ~95% duplicate code. Any weapon system changes need this cleaned up first or you're doing every change three times.
- ui.tsx is already 600+ LOC and mixes lobby UI, match UI, input handling, and shop UI. Adding upgrade selection UI here is possible but painful without some reorganization.
- No existing XP, stats, or per-run progression infrastructure at all — this is a greenfield build.
- Pathfinding is straight-line only. Obstacle routing requires new code.

---

## Feature-by-Feature Assessment

### 1. Replace Coins with XP

**Effort: Easy** (~1 day)

`zombieCoins.ts` is 23 lines. It's a dead-simple accumulator. Replacing it with an XP accumulator that tracks level thresholds and fires a "level up" event is straightforward.

The server-side equivalent in `lobbyServer.ts` and the player progress schema (`playerProgress.ts`) would need a new `xp` and `level` field per player, but the pattern is already there — the gold system does something similar.

**Risk:** Low. The only gotcha is deciding whether XP is purely client-local (simpler) or server-authoritative (harder but correct for multiplayer). Given the current architecture, server-authoritative is the right call.

**Verdict:** Do this first. It's the foundation everything else builds on.

---

### 2. Level-Up System + Stat Application

**Effort: Moderate** (2-3 days)

This is: XP threshold reached → fire event → apply stat multiplier. The complexity is in designing the stat system itself (what stats exist, how they interact, how they're stored) rather than the code.

A simple approach: each player has a `RunStats` object on the server with multipliers (`atkMultiplier`, `speedMultiplier`, `fireRateMultiplier`, etc.). Upgrades modify these multipliers. All combat calculations reference these.

The current game already has a partial version of this — `getFireRateMultiplier()` from the rage potion effect. That pattern can be generalized.

**Risk:** Moderate. Stat stacking can get weird if not designed carefully. If "attack speed" and "fire rate" are both upgrades, are they the same thing? Needs clear design upfront (see `02-xp-and-leveling-system.md`).

**Verdict:** Do this second, right after XP. Commit to a clean stat model before building the upgrade pool.

---

### 3. "Choose 3" Upgrade UI

**Effort: Moderate** (2-3 days)

The UI is React-based (`ui.tsx`). Adding a modal/overlay that appears on level-up with 3 upgrade cards is achievable. The challenge is `ui.tsx`'s current size and mixed concerns — it would benefit from extracting the upgrade UI into a separate component file.

The "pause wave while choosing" interaction needs thought in multiplayer (see doc `07`), but the UI itself is not technically hard.

**Risk:** Moderate. The UI layer is already strained at 600 LOC. Without some reorganization, adding upgrade UI will push it past the point of maintainability.

**Verdict:** Feasible, but budget time for ui.tsx cleanup as part of this work.

---

### 4. Pre-Defined Levels (Replace Endless Waves)

**Effort: Moderate-Hard** (3-5 days)

The `waveManager.ts` wave logic (spawn scheduling, zombie composition, timing) is reusable. What changes is the outer structure: instead of "wave 1 through 100 with a formula," you have "level 1 has waves A, B, C defined in a config, level 2 has waves D, E, F."

This is a config-system rewrite, not a scratch rewrite. `buildSpawnSchedule()` can stay. The wave phase state machine (`idle → countdown → fighting → wave_complete`) maps directly to the new structure.

The work is: define a level config schema, write the level progression manager, update the server to track "current level" instead of just "current wave."

**Risk:** Moderate. The server-client sync for "what level/wave are we on" is currently pretty tightly coupled to the endless wave model. Untangling that without breaking multiplayer takes care.

**Content risk:** Someone has to actually design the levels. 5-8 levels × 3-5 waves each is real design work, not just coding.

**Verdict:** This is the structural backbone of the pivot. Do it early, but after the XP/stat system is in place.

---

### 5. New Weapon: Melee (Sword)

**Effort: Hard** (3-5 days)

There is no melee in the current codebase. The existing projectile system (bullets fly through space, hit trigger zones on zombies) doesn't apply to melee. You'd need a different hit detection approach.

The most practical approach in DCL SDK 7: when the player swings, create a short-lived trigger zone in front of the player that checks for zombie collisions. This is essentially what the brick collision check does, just applied offensively. It's faking a hitbox, but it works.

The harder part: animations. A sword swing needs a player animation that doesn't currently exist and a visual model for the sword. Model + animation work may take as long as the code.

**Risk:** High. Hit detection that feels good for melee is notoriously hard to tune. Too small a hitbox = frustrating misses. Too large = feels like it hits through walls. In a top-down view with auto-aim, you need to think carefully about how melee targeting works.

**Verdict:** Worth pursuing, but design the feel on paper first. Decide: does the sword swing in a cone in front? In a full 360° radius? Does it auto-target nearest enemy? The answers affect the implementation significantly.

---

### 6. New Weapon: Area/Aura (Shield)

**Effort: Moderate** (2-3 days)

An aura that damages all enemies within radius X every Y seconds is actually simpler than the projectile system. It's a periodic check: `for each zombie within range, deal damage`. The current zombie distance checks in `zombie.ts` already do radius math.

The visual effect (shield bubble around player) would need a new 3D model or particle effect, but the logic is straightforward.

**Risk:** Low-Moderate. The main design risk: an aura weapon that auto-damages everything nearby may make the game too easy. Needs careful balancing — lower damage per tick, shorter range, upgradeable.

**Verdict:** This is probably the easiest "new" weapon to implement. A good candidate for the second weapon type after guns.

---

### 7. Obstacle Grid + Pathfinding

**Effort: Moderate** (3-4 days)

**This is lower effort than expected because the grid already exists.**

The `add-lava-system` branch has a complete, server-authoritative, client-synced grid system with 11×11 tiles covering the arena. The tile coordinate system, world position math, and sync mechanisms are all done.

Repurposing tiles as permanent obstacles (walls) instead of timed lava is conceptually simple: add a `wall` tile state type, render a wall GLB instead of lava, and mark those tiles as impassable.

The pathfinding work is: implement A* on the 11×11 grid, run it when a zombie spawns (or when its target moves significantly), and follow the resulting path. An 11×11 grid is 121 cells — A* on this is trivially fast, even running for 60+ zombies per frame.

The main code change is in `zombie.ts`: replace the straight-line movement with path-following movement. The rest of the zombie system (state machine, damage, animation) is untouched.

**Risk:** Moderate. The lava system is on a branch that hasn't been merged to main. The obstacle work should be done on top of that branch (or after it merges). Doing it from scratch without the grid infrastructure is a different story.

Also: what happens when the player moves? Does the zombie recalculate path frequently? Pathfinding updates every ~1 second is fine for the enemy count. Every frame is overkill.

**Verdict:** This is the most architecturally interesting change, and it's more achievable than it looks. The lava branch needs to merge first.

---

### 8. Enemy Shooters + Varied AI

**Effort: Hard** (3-5 days per new enemy type)

The current enemy state machine (SPAWNING → WALKING → ATTACKING) is clean and extensible. Adding new states (AIMING, SHOOTING, CHARGING, etc.) follows the same pattern.

The hard part is **enemy projectiles**. Currently enemies have no projectile system at all. Building one mirrors the player's bullet system but in reverse — enemies fire toward the player position with some accuracy offset. This is new code, but not novel code.

For a realistic MVP: start with 1-2 new enemy types, not 4. A "shooter" enemy that stops at mid-range and fires is the highest-value addition. A "charger" that dashes is next. Random movers add chaos but aren't as strategically interesting.

**Risk:** Moderate-High. More enemy types = more testing surface. Balancing shooters with the lava system and obstacle system simultaneously is genuinely complex. The fun balance (challenging vs unfair) needs live playtesting, not just design.

DCL performance: each new enemy entity type is another entity in the ECS. The 80-zombie cap already exists for performance reasons. Adding enemies that fire projectiles roughly doubles the entity count during a fight. The cap may need to drop to 40-50 active enemies when shooters are in play.

**Verdict:** Do this after the level structure and obstacle system are working. Enemy variety is a polish layer, not infrastructure.

---

### 9. Personal Progression in Multiplayer

**Effort: Moderate** (2-3 days)

The server already tracks per-player state (health, loadout). Adding per-player XP and upgrade arrays follows the same schema pattern. `playerProgress.ts` and the Colyseus room state would get new fields.

The tricky design question (not the technical one) is what happens during the "choose upgrade" moment in multiplayer — does the wave pause for both players? Does each player choose independently whenever they level up? This is a feel question that affects implementation significantly (see doc `07`).

**Risk:** Low-Moderate technically. High design risk if the multiplayer upgrade timing isn't thought through — it can feel disruptive or unfair if handled naively.

**Verdict:** Straightforward server work. The design decision needs to happen first.

---

## Summary Table

| Feature | Effort | Risk | Prerequisite |
|---|---|---|---|
| XP replaces coins | Easy | Low | — |
| Level-up + stat system | Moderate | Moderate | XP system |
| Choose-3 upgrade UI | Moderate | Moderate | Level-up system |
| Pre-defined levels | Moderate-Hard | Moderate | XP system |
| Melee weapon | Hard | High | Weapon refactor |
| Area/aura weapon | Moderate | Low | Weapon refactor |
| Obstacle grid + A* pathfinding | Moderate | Moderate | Lava branch merged |
| Enemy shooters | Hard | High | Level structure |
| Varied enemy AI | Hard | High | Enemy shooters |
| Personal multiplayer progression | Moderate | Moderate | Level-up system |

---

## Recommended Build Order

1. Merge `add-lava-system` branch to main
2. Refactor weapon system (extract shared code — prerequisite for any weapon work)
3. XP system (replace zombieCoins.ts)
4. Level-up + stat system
5. Pre-defined level structure (replace waveManager outer loop)
6. Choose-3 upgrade UI
7. Area/aura weapon (quick win, new weapon archetype)
8. Obstacle grid (repurpose lava grid)
9. A* pathfinding for enemies
10. Shooter enemies
11. Melee weapon (most complex, save for last)
12. More enemy types

---

## Platform Constraints (Hard Limits)

These cannot be engineered around — they're Decentraland platform constraints:

| Constraint | Impact |
|---|---|
| Max 2 players per match | Co-op only. No team dynamics beyond 2. |
| ~80 zombie entity cap | Limits wave density. Enemy projectiles eat into this cap. |
| No physics engine | Melee and projectile collision must be faked with trigger zones. |
| Fixed arena size (~44×44 units) | Small arena. Works for the format. |
| No NavMesh in SDK 7 | All pathfinding is custom code. The grid approach is the right call. |

---

## Total Effort Estimate

**Realistic scope for a complete pivot: 5-8 weeks of focused development.**

A minimal viable pivot (XP + leveling + 2 levels + obstacle grid + aura weapon + no new enemies) could be done in 2-3 weeks. That's enough to test whether the new loop actually feels better before committing to the full build.

**Recommendation:** Build the MVP pivot first. Play it. If it's more fun than the current game (low bar), continue. If not, cut losses early.
