# Enemy Variety Design

## Honest Assessment of Current Enemies

The three current enemy types (Basic, Quick, Tank) are texture differences, not behavior differences. They all:

- Walk in a straight line toward the player
- Attack by standing next to the player and dealing 1 damage/second
- Die when their HP reaches 0

The only variation is how fast they walk and how much HP they have. There's nothing to react to, dodge, or outplay. You just hold fire and they die. This is the core reason the current game feels dull.

Archero enemies are dangerous in different ways — some shoot patterns you dodge, some charge and overshoot, some teleport, some fly. The threat they pose changes how you move and where you position. That's what makes the game engaging.

We need enemies where the **right response is different depending on which enemy you're facing.**

---

## Design Principle

Each new enemy type should answer the question: **"How do I deal with this specific threat?"**

- Basic zombie: "Shoot it before it reaches me." (no skill, just DPS)
- Shooter: "Dodge its projectile, then shoot back." (requires movement)
- Charger: "Step sideways when it dashes, it'll overshoot." (requires timing)
- Erratic mover: "Lead my shots since it doesn't move predictably." (requires aim adjustment)

If the answer to every enemy type is "shoot it," variety is cosmetic.

---

## Existing Enemy Types (Revised for New System)

Keep all three existing types. Adjust their roles slightly to fit the new level structure:

| Type | HP | Speed | Role | Appears From |
|---|---|---|---|---|
| Basic | 3 | 1.5 m/s | Cannon fodder, XP income | Level 1 |
| Quick | 2 | 2.8 m/s | Pressure, punishes standing still | Level 2 |
| Tank | 10 | 0.75 m/s | Time sink, obstacle navigation test | Level 3 |

The only change: they now navigate around obstacles instead of walking through them. Their HP/speed values stay the same.

---

## New Enemy Type: Shooter

### Threat
Stops at mid-range (8-12m) and fires a projectile toward the player's current position. The player must dodge. If hit, 1 HP damage. Repeat every 2-3 seconds.

### AI State Machine

```
SPAWNING → WALKING → [if distance < 10m: AIMING] → SHOOTING → WALKING
```

- **WALKING:** Move toward player until within firing range (10m)
- **AIMING:** Stop. Play aiming animation (0.5s telegraph). This is the dodge window.
- **SHOOTING:** Fire projectile toward player's position at the time of fire
- After shooting: brief cooldown (2-3s), then walk again if player moved outside range

### Projectile Behavior
- Speed: 5 m/s (slower than player bullets — must be dodgeable)
- Visual: distinct color (orange or green), slightly larger than player bullets
- Disappears after 15m or on hit
- Deals 1 HP damage on contact with the player's hitbox

### Design Notes
- The 0.5s aiming telegraph is critical. Without it, the projectile is instant-reaction impossible to dodge. The visual telegraph ("it's about to shoot") is what makes dodging fair.
- Shooter should be positioned behind other zombies in waves — a shooter at the back of a group is much more threatening than a solo shooter.
- HP: 4-5. More fragile than a Tank but enough to survive a few hits. Can't be instantly popped before it fires.

### Implementation
New AI state and projectile spawning in `zombie.ts`. The projectile system mirrors the player's but in reverse — instead of targeting a zombie, it targets the player's position. The basic projectile infrastructure from `gun.ts` can be referenced.

**Effort: Hard.** Requires new AI states, new projectile system for enemy projectiles, and careful balance tuning.

---

## New Enemy Type: Charger

### Threat
Waits at medium range, then dashes directly at the player at high speed. If the dash connects, 2 HP damage (higher than normal). If the dash misses (player dodges), the charger continues past and has a cooldown before it can charge again.

### AI State Machine

```
SPAWNING → WALKING → [if distance 6-12m: CHARGING_WINDUP] → CHARGING → COOLDOWN → WALKING
```

- **WALKING:** Move toward player at normal speed (1.5 m/s)
- **CHARGING_WINDUP:** Stop. Crouch/lean animation (0.8s telegraph). Do not move.
- **CHARGING:** Dash at 6 m/s in a straight line for 1.5 seconds regardless of where the player moves
- **COOLDOWN:** Stand still for 2 seconds. Vulnerable during this window.
- Back to WALKING.

### Design Notes
- The overshoot mechanic is key. After the charge, the enemy is past the player and in cooldown. That's the player's window to deal big damage.
- 2 HP damage on a successful charge hit makes it punishing but not one-shotting.
- Should have low HP (3 HP) — it's a glass cannon. Skill check: dodge the charge, then burst it during cooldown.
- Chargers in groups are very dangerous. One charger is skill-testable. Three charging simultaneously from different directions is overwhelming — limit spawn density.

### Implementation
New AI states, high-speed movement in a fixed direction during CHARGING. Relatively straightforward ECS system addition. No new projectiles needed.

**Effort: Moderate.** Simpler than Shooter since there's no projectile system.

---

## New Enemy Type: Erratic Mover

### Threat
Moves toward the player but changes direction every 0.5-1 second with a random ±45° offset. This makes predicting their path unreliable — auto-aim handles this, but it means they take longer to kill and weave in closer than expected.

### AI State Machine
Same as WALKING for Basic, but movement direction recalculates every 0.5-1.0 seconds with noise.

```
direction = towardPlayer + randomAngle(-45, 45 degrees)
```

### Design Notes
- This is intentionally a simple implementation but a meaningful feel difference.
- The random movement makes the enemy feel "alive" compared to the dead-straight Basic.
- Should be fast (like Quick but with the erratic pattern) to make it feel threatening.
- Works best in groups — multiple erratic movers create a chaotic wave that's harder to control than orderly approaching zombies.

### Implementation
Minor change to the movement update in `zombie.ts`. Add a direction-noise timer, apply random angle offset every N ms. No new states needed.

**Effort: Easy.** This is the simplest new enemy type.

---

## New Enemy: Elite / Mini-Boss

### Concept
A buffed variant that appears once per level (usually on the final wave). Not a new visual — use the Tank model with a visual distinction (glowing eyes, larger scale, different color aura). Has both Tank HP and Shooter ability.

**Stats:**
- HP: 20 (double Tank)
- Speed: 1.0 m/s (slightly faster than Tank)
- Behavior: walks toward player AND shoots every 4 seconds
- XP: 100 (major reward)

### Design Notes
- The elite is the "boss" equivalent in the absence of a true boss fight.
- Should be telegraphed by a spawn announcement (name on screen, audio sting)
- One per level maximum. Flooding a level with elites would be overwhelming and frustrating.
- The combination of high HP + shooting creates a "manage and whittle" challenge: you can't just stand and DPS because it shoots back, but it's not fast enough to chase you down if you keep moving.

### Implementation
Composite behavior combining Tank movement + Shooter firing logic. Reuses both new systems.

**Effort: Low** (once Shooter is implemented, Elite is just a config variant).

---

## Enemy Appearance Schedule Per Level

| Level | Enemy Types Present |
|---|---|
| 1 | Basic |
| 2 | Basic, Quick |
| 3 | Basic, Quick, Tank |
| 4 | Basic, Quick, Tank, Erratic |
| 5 (MVP final) | Basic, Quick, Tank, Erratic, Shooter (final waves), Elite (wave 5 only) |
| Future levels | Charger, more complex elites |

**Don't introduce everything at once.** Each new enemy type should have at least 1-2 waves where it's the only new thing, so players can learn its behavior before dealing with it mixed with other types.

---

## Performance Considerations

The current 80-zombie cap exists because each zombie is an ECS entity with Transform, Animator, custom components, and collision checks every frame.

Shooters add projectile entities (1 per shot, multiple active at once). With 10 shooters each firing every 3 seconds, you have 3-4 additional projectile entities alive at any time — manageable.

Recommendation: when shooter enemies are active in a wave, reduce the total zombie spawn count for that wave by 20-25% to stay within performance budget.

---

## What NOT to Build (For Now)

- **Flying enemies** — requires a different movement model (vertical component), different pathfinding, different animations. Out of scope for this pivot.
- **Splitting enemies** (split into 2 on death) — interesting concept but the entity management is tricky.
- **Teleporting enemies** — visually cool, but the instant position change is jarring in a 3D space without good visual effects.

These could be future additions. Don't add them to the first iteration.
