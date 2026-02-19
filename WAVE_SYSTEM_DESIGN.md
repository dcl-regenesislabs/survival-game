# 100-Wave Survival System Design

## Overview
This document explains the wave progression system designed for maximum engagement over 100 waves of zombie survival gameplay.

## Design Philosophy

The wave system is built on proven principles from successful wave-based games like **Call of Duty Zombies**, **Killing Floor**, and **Left 4 Dead**:

1. **Progressive Difficulty** - Exponential scaling keeps experienced players challenged
2. **Variety Through Composition** - Different enemy mixes require tactical adaptation  
3. **Pacing & Rhythm** - Boss waves and spawn timing create natural tension/release cycles
4. **Achievability** - Early waves build confidence; late waves provide prestige goals

---

## Wave Progression Breakdown

### **Phase 1: Tutorial (Waves 1-10)**
**Goal**: Teach mechanics, build player confidence

- **Enemy Types**: Basic zombies only
- **Zombie Count**: 5-12 per wave (gradual increase)
- **Spawn Pattern**: Small groups with breathing room
- **Key Learning**: Movement, shooting, resource management

**Wave 10**: First BOSS WAVE - Multiple basic zombies test foundational skills

---

### **Phase 2: Escalation (Waves 11-25)**
**Goal**: Introduce tactical variety

- **Enemy Types**: Basic (75%) + Quick (25%)
- **Zombie Count**: 12-25 per wave
- **Spawn Pattern**: Mixed groups, faster cadence
- **Tactical Shift**: Players must prioritize fast-moving threats

**Wave 20**: BOSS WAVE - Heavy quick zombie presence with basic support

---

### **Phase 3: Full Spectrum (Waves 26-50)**
**Goal**: Balanced challenge with all enemy types

- **Enemy Types**: Basic (50%) + Quick (35%) + Tank (15%)
- **Zombie Count**: 25-45 per wave
- **Spawn Pattern**: Varied compositions, strategic variety
- **Tactical Depth**: 
  - Tanks require sustained fire / positioning
  - Quick zombies punish poor positioning
  - Basic zombies overwhelm if ignored

**Boss Waves (30, 40, 50)**: 
- 40% Tanks + 35% Quick + 25% Basic
- Tests resource management and target prioritization

---

### **Phase 4: Pressure Cooker (Waves 51-75)**
**Goal**: Challenge veterans with harder enemy ratios

- **Enemy Types**: Basic (30%) + Quick (40%) + Tank (30%)
- **Zombie Count**: 45-65 per wave
- **Spawn Pattern**: Aggressive timing, large groups
- **Challenge**: Constant pressure, fewer "safe" moments

**Boss Waves (60, 70)**: 
- Tank-heavy compositions
- Quick zombies close distance fast
- Requires excellent positioning and accuracy

---

### **Phase 5: Endgame (Waves 76-100)**
**Goal**: Ultimate challenge for elite players

- **Enemy Types**: Basic (30%) + Quick (40%) + Tank (30%)
- **Zombie Count**: 65-80 per wave (capped for performance)
- **Spawn Pattern**: Relentless, minimal downtime
- **Prestige**: Only the best players reach Wave 100

**Boss Waves (80, 90, 100)**:
- Maximum enemy density
- Wave 100 is the ultimate challenge - completion means total victory

---

## Spawn Mechanics

### Normal Waves
- Zombies spawn in **groups of 2-5**
- **2 seconds** between each group
- Prevents overwhelming the player instantly
- Creates rhythm of "clear, breathe, engage, repeat"

### Boss Waves (Every 10th Wave)
- **Tanks spawn first** in pairs (the "bosses")
- 1.5 second delay between tank groups
- **Then supporting enemies flood in** (groups of 6)
- 0.8 second delay between floods (faster!)
- Creates epic "hold the line" moments

---

## Mathematical Scaling

### Zombie Count Formula
```
baseCount = 5-8 (depending on wave range)
scaleFactor = (1 + wave/10)^1.3
totalZombies = baseCount * scaleFactor
cap at 80 for performance
```

**Why This Formula?**
- **Early waves** scale slowly (gives breathing room)
- **Mid waves** scale moderately (steady challenge)
- **Late waves** scale aggressively (exponential difficulty)
- **Cap at 80** prevents performance issues while still being overwhelming

### Example Zombie Counts
- Wave 1: ~5 zombies
- Wave 10: ~12 zombies
- Wave 25: ~26 zombies  
- Wave 50: ~52 zombies
- Wave 75: ~72 zombies
- Wave 100: ~80 zombies

---

## Enemy Composition Strategy

### Why These Ratios?

**Basic Zombies (Green)**
- Role: Filler enemies, volume threat
- Easy to kill but dangerous in numbers
- Forces area awareness

**Quick Zombies (Yellow)**  
- Role: Pressure, punishment for mistakes
- Forces mobility and quick reactions
- Introduced at Wave 11 when players understand basics

**Tank Zombies (Purple)**
- Role: Damage sponges, resource drains
- Requires sustained accurate fire
- Introduced at Wave 26 when players have weapon upgrades
- Never exceeds 40% of composition (would be tedious)

---

## Boss Wave Design

Boss waves occur every 10 waves (10, 20, 30...100).

**Philosophy**: 
- Not a single "big boss" (would require new assets)
- Instead: **Composition-based boss fights**
- Overwhelming numbers + difficult enemy ratios = boss challenge

**Boss Wave Formula**:
1. **40% Tanks** - The "bosses" themselves
2. **35% Quick** - Chase you down, punish mistakes  
3. **25% Basic** - Distraction, filler threat

**Spawn Pattern**:
- Tanks spawn first (sets ominous tone)
- Quick/Basic flood after (creates panic)
- Tests everything: aim, movement, resource management

---

## Difficulty Curve Visualization

```
Difficulty
   ^
   |                                              ****
   |                                         ****
   |                                    ****
   |                              *****  <- Boss spikes
   |                        *****
   |                  *****
   |            *****
   |      *****
   |*****________________________________________>
   0    10   20   30   40   50   60   70   80  100  Wave
   
Tutorial  Ramp-up  Full Game  Veteran  Endgame
```

---

## Playtesting Recommendations

### Tuning Knobs (in `waveManager.ts`)

If you find the system too easy/hard, adjust these values:

```typescript
// Line 6: Countdown between waves
const COUNTDOWN_SECONDS = 5  // Increase for more breathing room

// Line 7: Time between spawn groups  
const SPAWN_INTERVAL_SECONDS = 2  // Increase to slow spawn rate

// Lines 110-115: Base zombie count
let baseCount = 8  // Decrease to make waves easier

// Line 117: Scaling exponent
const scaleFactor = Math.pow(1 + wave / 10, 1.3)
// Change 1.3 to:
//   - 1.1-1.2 for gentler scaling
//   - 1.4-1.5 for more aggressive scaling

// Line 120: Performance cap
totalZombies = Math.min(totalZombies, 80)  // Lower if performance issues
```

### Testing Focus

1. **Waves 1-10**: Should feel like a tutorial, very manageable
2. **Wave 20**: First real challenge, should take 2-3 attempts
3. **Wave 50**: Midpoint milestone, tests mastery
4. **Wave 75**: Expert-level, very difficult
5. **Wave 100**: Ultimate achievement, extremely hard but possible

---

## Future Enhancements

### Potential Additions

1. **Special Boss Enemy**: Create a unique "Zombie Boss" model
   - Spawns on Wave 25, 50, 75, 100
   - High HP, special abilities
   - Would require new asset

2. **Dynamic Difficulty**: Track player performance
   - If player dies, next attempt is slightly easier
   - If player dominates, increase difficulty

3. **Wave Modifiers**: Special conditions
   - "Horde" - 2x enemies, 0.5x HP
   - "Elite" - 0.5x enemies, 2x HP  
   - "Blitz" - Fast spawns, no breaks

4. **Rewards Per Wave**: Unlock weapons/upgrades
   - Wave 10: Shotgun unlocked
   - Wave 20: Minigun unlocked
   - Wave 50: Super weapon

---

## Summary

This 100-wave system provides:

✅ **Smooth learning curve** (Waves 1-10)  
✅ **Engaging variety** (3 enemy types, varied compositions)  
✅ **Epic moments** (Boss waves every 10 waves)  
✅ **Long-term goals** (Wave 50, 75, 100 milestones)  
✅ **Replayability** (Exponential difficulty rewards skill)  

The system is designed to be **fun for 10-30 minutes** (casual players) while providing **prestige goals** for hardcore players attempting Wave 100.

---

**Good luck, survivor!** 🧟‍♂️🔫
