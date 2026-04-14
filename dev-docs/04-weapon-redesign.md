# Weapon Redesign

## The Current Problem

The three existing weapons are almost identical in code and feel. They share the same projectile system, the same auto-aim logic, the same hit detection. The differences:

- **Gun:** 2 shots/sec, single projectile
- **Shotgun:** 2 shots/sec, 3 projectiles in a 30° spread
- **Minigun:** 5 shots/sec, single projectile

That's it. No range difference. No damage model difference. No fundamental change in how you play. The shotgun technically rewards close-range positioning but there's no reason to stand close when all weapons have 100m range. The minigun is just better DPS in most scenarios.

This isn't interesting. The pivot is an opportunity to make weapons feel meaningfully different.

---

## Philosophy for the New Weapon System

Weapons should change **how you play**, not just your numbers. A player using the sword should be positioned differently, moving differently, and making different decisions than a player using a gun. If two weapons just require "aim at enemy, hold fire," they're not meaningfully different.

In Archero, the bow changes to crossbow, lightning, etc. — each has a different targeting pattern. We should aim for the same: each weapon archetype has a different **attack pattern** that demands different play.

---

## Repurposing Existing Weapons

The three current weapons become the **Ranged family** — you start with one and find others.

### Pistol (was: Gun)
**Role:** Balanced starter. Medium fire rate, single target.  
**Changes:** Slight damage increase to differentiate from shotgun. Becomes the default starting weapon. Benefit from `pierce` and `ricochet` upgrades best.

### Shotgun
**Role:** Close-range burst. High spread, punishes distance.  
**Changes:** Reduce effective range (damage falloff beyond 8m — projectiles still travel but deal 50% damage past that point). This makes close-range positioning meaningful. 3 pellets → 5 pellets at base, but damage per pellet slightly lower.

### Minigun
**Role:** Sustained suppression. High fire rate, inaccuracy penalty.  
**Changes:** Add a small random spread (±5°) to give it an identity beyond "fast pistol." Pairs well with `multishot` upgrades. Good for crowds, weaker on single hard targets.

**Code note:** These three files (`gun.ts`, `shotgun.ts`, `minigun.ts`) are ~95% duplicate code. Before touching any weapon, refactor them into a base weapon class with overridable parameters. Otherwise every change has to be made three times.

---

## New Weapon: Sword (Melee)

### Concept
The sword does not fire projectiles. It swings in an arc in front of the player, hitting all enemies within range of the arc. Short range (2-3m), high damage, fast enough that it rewards aggressive positioning.

### How It Works
DCL SDK 7 has no physics/mesh sweep. The approach: when the player swings, create a trigger zone (a wide, short cylinder in front of the player) for 0.3 seconds. Any zombie entity inside that zone takes damage. This is the same trigger-zone approach used for brick collision — just offensive.

**Attack pattern:**
- Swing arc: 180° in front of player (auto-facing nearest enemy)
- Damage radius: 2.5m
- Damage per swing: 3 HP (higher than gun to compensate for range)
- Swing speed: 1.2 swings/sec base
- Animation: needs a new player animation (sword swing)

### Design Decisions to Resolve
1. **Does the sword auto-face the nearest enemy or always face the player's movement direction?**  
   Auto-face is more Archero-like. Movement direction is more skill-based. Start with auto-face.

2. **Can it hit multiple enemies in one swing?**  
   Yes — that's the point of melee. The arc hit all enemies in range simultaneously.

3. **Does the player need to be stationary to swing?**  
   No. Melee is only viable if you can swing while moving. The auto-aim handles targeting.

### Challenges
- Animation: a sword swing animation for the player doesn't exist. Either add one or use a visual particle burst to fake the swing.
- Balance: melee needs to feel faster and harder-hitting than ranged to justify the risk of being close. 3× range disadvantage should mean ~2× damage advantage minimum.
- The hitbox generosity needs playtesting. Melee that misses feels terrible.

---

## New Weapon: Aura / Shield

### Concept
The aura doesn't fire anything. It passively damages all enemies within a radius around the player, ticking every 3 seconds. It's not something you activate — it just works. This creates a playstyle where you want enemies close to you, which is the opposite of what gun users want.

### How It Works
Every 3 seconds (base), check all zombie entities within `AURA_RADIUS` (4m base). Deal damage to all of them. Show a visual pulse (expanding ring or particle burst around player).

This is structurally the simplest new weapon: a timer + radius check. The zombie distance math already exists in `zombie.ts`.

**Base stats:**
- Damage per pulse: 1 HP
- Pulse interval: 3 seconds
- Radius: 4m

With upgrades (`shield_pulse` shortens interval, `atk_power` increases damage, `range` increases radius), the aura becomes powerful. At max stack it pulses every 1.5s with 3m range and 2 HP damage — basically a constant AOE field.

### Challenges
- Visual clarity: players need to see the aura radius and when it's about to pulse. A faint circle on the floor and a visual burst on trigger.
- Might feel passive/boring with no interaction. Counter-argument: Archero's magic orb weapon is exactly this and it's popular because the upgrade synergies are satisfying.

---

## Weapon Discovery System

Archero drops weapons from enemies or chests. We have no chest system and dropping world items is more complex than it sounds in DCL.

**Two options:**

**Option A: Level-start weapon pick**  
At the start of each level (not mid-run), you're offered 3 weapons to choose from. You keep the one you pick until the next level. Similar to how Archero's hero select works.

Simple to implement, no mid-run item management. Downside: no exciting mid-run weapon swaps.

**Option B: Weapon drop from kills**  
Rare chance (5-10%) for a boss/tank zombie to drop a weapon item. Player walks over it to pick it up, replacing their current weapon.

More exciting, more Archero-like. Harder to implement (new entity type, pickup detection, UI for "new weapon found"). Also risks frustrating situations (bad drop, or drop in lava).

**Recommendation for MVP:** Option A (level-start pick). It's simpler, tests the weapon variety concept, and can be upgraded to Option B later once the core loop is validated.

---

## Weapon + Upgrade Interaction

Some upgrades are universal, some are weapon-family-specific:

| Upgrade | Applies to |
|---|---|
| Raw Power | All weapons |
| Crit Chance | All weapons |
| Move Speed | All weapons |
| Haste (fire rate) | Ranged family only |
| Multishot | Ranged family only |
| Pierce | Ranged family only |
| Ricochet | Ranged family only |
| Sword Mastery | Sword only (wider arc) |
| Shield Pulse | Aura only (faster interval) |
| Overcharge | Aura only (damage increase) |

The upgrade draw pool should filter weapon-specific upgrades to only appear if the player has that weapon type equipped.

---

## Code Structure Recommendation

Before building any new weapon, the current weapon code needs restructuring:

```
Current state:
  gun.ts         ← ~286 LOC, 95% duplicated
  shotgun.ts     ← ~226 LOC, 95% duplicated
  minigun.ts     ← ~216 LOC, 95% duplicated

Proposed structure:
  weaponBase.ts  ← shared logic: auto-aim, projectile creation, fire rate timer
  weapons/
    pistol.ts    ← override: fire rate, projectile count, spread
    shotgun.ts   ← override: fire rate, projectile count, spread, range falloff
    minigun.ts   ← override: fire rate, inaccuracy
    sword.ts     ← new: trigger zone logic, arc hit
    aura.ts      ← new: interval timer, radius check
```

This refactor is not optional before adding new weapons — otherwise you're maintaining 5 nearly-identical files.
