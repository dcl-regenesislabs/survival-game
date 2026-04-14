# Multiplayer and Personal Progression

## The Core Tension

The current game has 2 players, shared everything: shared waves, shared enemies, shared economy. Dying together ends the match. This works fine for the current shallow loop because there's nothing personal to protect.

The Archero-like pivot introduces **per-player progression** — each player has their own XP, their own level, and their own upgrades. This creates a tension: the arena is shared (same enemies, same obstacles, same lava) but the character you're building is yours alone.

This is actually fine and common in co-op roguelites. But it needs to be designed deliberately.

---

## What Is Shared vs Personal

### Shared (Same for Both Players)
- Enemy spawn waves (both see the same zombies)
- Obstacle layouts (same walls for both)
- Lava hazard patterns (same lava for both)
- Wave progression (both players advance when the wave is cleared)
- Level progression (when both players have cleared the level, advance to next)
- Match start / match end

### Personal (Each Player Has Their Own)
- XP accumulation
- Player level
- Active upgrades (the choices they've made this run)
- Computed stats (derived from upgrades)
- Weapon choice (each player can use a different weapon type)
- Health and respawn state

**Kills:** Both players can hit the same zombie. XP for the kill goes to the player who lands the killing blow. This is the standard approach and the simplest to implement (already the pattern for damage credit).

---

## Personal Progression on the Server

The server already tracks per-player state. Adding run-specific progression means adding a `RunState` object per arena player:

```
ArenaPlayer {
  // existing
  address: string
  health: number
  
  // new: per-run, reset on each new match
  xp: number
  level: number
  upgrades: UpgradeEntry[]
  stats: ComputedStats
  pendingUpgradeChoice: boolean
  weapon: string  // active weapon ID
}
```

This resets to defaults when a player leaves the arena or a new match starts. It does NOT persist to `PlayerProfileV1` (the cross-run storage). Upgrade choices are within a single run.

---

## The Level-Up Timing Problem

The biggest multiplayer design challenge is: what happens when one player levels up mid-wave?

### Option A: Immediate Level-Up (Async)
The player who levels up sees the "choose upgrade" UI immediately, even during combat. The other player continues fighting normally. Each player chooses their own upgrades whenever they level up.

- **Pro:** Most responsive feel. No waiting for your partner.
- **Con:** One player is paused-for-choice while the other is in combat. If combat is tense, this feels disruptive. Also, the leveling-player's character is effectively frozen during the choice.
- **Con:** UI clutter — one player is making a choice while their screen shows active combat behind the UI.

### Option B: Wave-End Level-Up Only
Level-ups that happen during a wave are queued. At wave end (rest phase), both players simultaneously see their pending level-up choices (if any). Choose during the 30-second rest period.

- **Pro:** Clean separation between combat and upgrade decisions. No interruption.
- **Con:** Multiple level-ups in one wave means multiple sequential choices at wave end ("you leveled up 3 times, choose 3 times"). Could feel front-loaded.
- **Pro:** Synchronized experience — both players are in the same phase at the same time.

### Option C: Pause Both Players on Level-Up
When either player levels up mid-wave, combat pauses for both, upgrade choice is made, combat resumes.

- **Pro:** Fair. Neither player is disadvantaged while their partner chooses.
- **Con:** Annoying if the level-up happens at a bad moment ("I was about to kill that tank!"). Pause-on-levelup can break combat flow.
- **Con:** Requires server-side wave pause logic.

**Recommendation: Option B (wave-end only)** for MVP. It's the cleanest implementation, avoids mid-combat UI, and the rest phase is already 30 seconds — plenty of time to make upgrade choices. If it feels like upgrades come too late/slow, move to Option A.

---

## What Happens When Players Have Very Different Levels

If player 1 is Level 8 and player 2 is Level 3 (because player 2 died a lot and has fewer kills), is this fun?

**Short answer:** Probably yes, actually. Co-op games with individual progression typically lean into this as a "experienced + newcomer" dynamic. The stronger player carries slightly more weight; the weaker player still matters and is catching up.

**The risk:** if the gap gets large enough, the weaker player feels irrelevant. They're dying to enemies the stronger player handles trivially.

**Mitigations:**
1. **Respawn contribution:** Both players get XP from all kills, not just the killing blow. So dying doesn't stop XP accumulation entirely (you respawn and keep gaining XP from partner's kills). Actually, **split XP from all kills** might be more fair: both players gain XP when any enemy dies (maybe 70% to killer, 30% to partner). Keeps players closer in level.

2. **Level cap per level:** Consider a soft level cap that prevents a player from leveling up too far ahead on any given level. Example: on Level 2, max level is 5. Forces both players to arrive at Level 3 in a similar range.

3. **No level cap:** Lean into the asymmetry. One player becomes a tank build, one becomes a speedrun DPS build. This is valid co-op design.

**Recommendation:** Start with no artificial level cap. Use 70/30 XP split for shared kills. Playtest and see if the gap creates problems.

---

## Multiplayer Upgrade Choice UI

During the rest phase, both players see their own "choose upgrade" screen if they have pending level-ups. They make their choices independently and simultaneously. The wave doesn't start until both players have confirmed their choices (or the rest timer runs out — auto-pick random if timer expires).

**Server message flow:**
1. Wave ends → server sends `waveComplete` message
2. Server sends `playerLevelUpPending` to each player who leveled up during that wave (may be multiple pending)
3. Client shows upgrade selection UI for first pending level-up
4. Player selects → `playerChoseUpgrade` sent to server
5. Server applies upgrade, sends back `playerUpgradesState` (updated stats)
6. If more pending level-ups: repeat from step 3
7. When both players signal ready (or rest timer expires) → start next wave

**Race condition guard:** The rest phase timer (`WAVE_REST_SECONDS = 30`) must be long enough for both players to make choices. With multiple level-ups possible, this might need to be extended to 45 seconds in later levels.

---

## Death and Respawn in the New System

Currently: die → respawn in 2 seconds at center. Match ends when all players die simultaneously (team wipe).

In the new system: respawn stays the same. Run continues until:
- All players die simultaneously within the same wave (team wipe → restart level)
- Or all players die within the same wave with no more respawns (if we add a limited-respawn design)

**Upgrade behavior on death:** Dying does NOT remove your upgrades. You keep your level and all choices when you respawn. Death is already punishing (you're out of combat, partner is alone, enemies may kill them). Losing upgrades on top of that would feel brutal.

**Team wipe behavior:** When both players die with no one alive to continue, the level restarts. Both players' run states are reset (XP, levels, upgrades all reset to 0). This is a meaningful punishment without being permanently destructive.

---

## Is Multiplayer Worth Keeping?

Worth asking directly: Archero is a solo game. Co-op wasn't added until much later. The design of "personal progression + shared arena" creates friction. Is the multiplayer adding fun or complicating design?

**Arguments for keeping multiplayer:**
- The existing architecture is already multiplayer. Removing it is more work than keeping it.
- Co-op is a strong differentiator on Decentraland, which is inherently social.
- Two players covering different upgrade paths (one tanky, one fast/DPS) creates emergent synergy.

**Arguments against:**
- The 2-player cap means you can't form a real "party." It's always exactly 2 or nothing.
- Personal progression in a 2-player game means the difficulty is designed for 2 players with similar power levels. Edge cases (big level gap, one player dead, different weapon builds) all add design surface to manage.
- Solo play should be equally supported — don't design levels that are impossible solo.

**Recommendation:** Keep multiplayer, ensure the game is fully functional and fun solo, and treat the 2-player co-op as an optional enhancement. Design levels for 1 player. If 2 players join, it gets easier (which is fine — this is a casual game on DCL).
