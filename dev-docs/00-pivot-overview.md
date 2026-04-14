# Archero-Like Pivot: Overview

## What Is This Document?

This is a design exploration — not a commitment. The goal is to understand what the game would become if we pivoted from the current endless-wave format to an Archero-inspired structure, and whether that's worth pursuing.

---

## The Current Game (Honest Summary)

Players spawn into a fixed arena, endless waves of zombies come at them, they shoot with one of three guns (which are basically the same gun with slightly different stats), collect coins to place bricks, and eventually die. That's it.

The loop is: **shoot → get coins → place brick → repeat until dead.**

There's no meaningful progression within a run. No decisions that feel important. No variety in how you engage with enemies. The coin/brick system is the only "strategy," and it's shallow — bricks are just a temporary wall that zombies walk around anyway.

---

## What the Pivot Looks Like

Instead of one endless arena, the game becomes a series of **short, structured levels**. Each level has a defined set of waves. Completing a level lets you progress to the next. Dying sends you back to the start of that level (or the whole run — TBD).

**The core loop changes to:**

> Kill enemies → earn XP → level up → choose an upgrade → repeat, growing stronger over the run

The moment-to-moment feel stays similar (top-down arena shooting) but now there's a **meta-layer of decisions** layered on top. The player is building a character as they play.

---

## What Changes

### Economy
**Before:** Zombies drop coins. Coins buy bricks and weapons.  
**After:** Zombies drop XP. XP fills a level bar. When you level up, you choose 1 of 3 randomly presented upgrades. No shop. No coins. Weapons are found in the world or chosen at level start.

The shift removes the passive "accumulate coins, place bricks" loop and replaces it with active decision-making every few kills.

### Progression
**Before:** Progression lives outside the run (buy better weapons with gold between runs).  
**After:** Progression is per-run and personal. You start weak and grow strong within a single session. Cross-run persistence (if any) is cosmetic or minor.

### Wave Structure
**Before:** 100 waves, exponentially scaling, theoretically infinite play.  
**After:** ~5-8 defined levels, each with 3-5 waves. Each level introduces new enemy types, new environmental hazards, and a new obstacle layout. Clear progression: you know how far you've come and how far you have to go.

### Weapons
**Before:** Gun → Shotgun → Minigun. All hitscan, all ranged, only differentiated by fire rate and spread.  
**After:** Multiple weapon archetypes — ranged (repurposed guns), melee (sword/blade that hits in a radius), and area/aura (shield that pulses damage around the player). Each archetype plays differently and interacts with upgrades differently.

### Enemies
**Before:** 3 types — Basic (walks), Quick (walks faster), Tank (walks slower, more HP). All of them just walk toward you and hit you.  
**After:** Enemies have distinct behaviors. Some shoot back. Some charge and overshoot. Some move erratically. The threat they pose changes how you position and move, not just how much you shoot.

### Environment
**Before:** Open flat arena. Bricks are the only terrain (temporary, player-placed).  
**After:** Each level has a pre-defined obstacle layout — walls, pillars, chokepoints — that changes how both players and enemies move. Lava tiles can still spawn as a hazard layered on top. The arena feels different every level.

### Multiplayer
**Before:** 2 players, shared economy, shared fate.  
**After:** 2 players, personal XP, personal upgrades. The arena is shared (same enemies, same lava, same obstacles) but each player builds their own character independently. One player's upgrades don't affect the other.

---

## What Stays the Same

- Top-down isometric camera and feel
- Auto-aim + auto-shoot (or manual aim — TBD)
- Server-authoritative multiplayer with Colyseus
- The basic enemy spawn/despawn system (reused, not rewritten)
- The lava hazard system (now merged into the level design toolkit)
- The core visual identity (zombie models, arena aesthetic)
- Max 2 players per match (Decentraland platform constraint)

---

## What Gets Cut

- The brick-placement system (the main "defense" mechanic — gone)
- The between-run weapon shop (replaced by per-run weapon finding)
- The 100-wave endless structure
- The gold currency system (replaced by XP)

The brick system is worth calling out specifically: it's the most "unique" thing in the current game, and cutting it means losing the only spatial/strategy element. That's okay — the replacement (obstacle layouts, movement decisions) is more interesting and less passive.

---

## The Big Question

Does the platform support this? Decentraland has hard constraints:

- **2 players max per match.** Archero is a solo game at heart. Two players is actually fine — it's a co-op arcade feel.
- **80 zombie cap on screen at once.** Archero often has dense enemy groups. 80 is enough for the feel we want.
- **No physics engine.** Melee weapons require faking it. Projectile-from-enemy requires custom code.
- **Fixed scene size (~44×44 units).** Small arena. Fine for this format — Archero arenas are small too.

None of these constraints are blockers. They just mean the game will be a lighter, more focused version of the Archero formula rather than a 1:1 recreation.

---

## What This Is NOT

This is not a clone of Archero. The goal is to borrow what makes Archero satisfying — the run-based upgrade loop, weapon variety, enemy diversity — and apply it to what this game already is. The result should feel like its own thing, built on the same engine and aesthetic.
