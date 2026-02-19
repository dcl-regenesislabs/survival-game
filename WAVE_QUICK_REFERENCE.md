# Wave System Quick Reference

## Wave Phases at a Glance

### 🎓 TUTORIAL (Waves 1-10)
- **Enemies**: Basic zombies only
- **Count**: 5-12 zombies
- **Goal**: Learn the game
- **Boss**: Wave 10 - Basic zombie swarm

---

### 📈 ESCALATION (Waves 11-25)
- **Enemies**: 75% Basic + 25% Quick (Yellow)
- **Count**: 12-25 zombies
- **New Threat**: Fast-moving quick zombies
- **Boss**: Wave 20 - Quick zombie heavy

---

### ⚔️ FULL CHALLENGE (Waves 26-50)
- **Enemies**: 50% Basic + 35% Quick + 15% Tank (Purple)
- **Count**: 25-45 zombies
- **New Threat**: Tanky enemies with 10 HP
- **Bosses**: Waves 30, 40, 50 - Tank heavy (40% tanks!)

---

### 🔥 VETERAN (Waves 51-75)
- **Enemies**: 30% Basic + 40% Quick + 30% Tank
- **Count**: 45-65 zombies
- **Intensity**: Constant pressure
- **Bosses**: Waves 60, 70 - Maximum chaos

---

### 💀 ENDGAME (Waves 76-100)
- **Enemies**: 30% Basic + 40% Quick + 30% Tank
- **Count**: 65-80 zombies (performance capped)
- **Status**: Elite challenge
- **Final Boss**: Wave 100 - Ultimate victory!

---

## Enemy Stats

| Type | Color | HP | Speed | Role |
|------|-------|----|----|------|
| **Basic** | Green | 3 | 1.5 | Volume threat |
| **Quick** | Yellow | 2 | 2.6 | Speed demon |
| **Tank** | Purple | 10 | 0.75 | Bullet sponge |

---

## Boss Wave Schedule

Every 10th wave is a BOSS WAVE:

**10, 20, 30, 40, 50, 60, 70, 80, 90, 100**

Boss composition: **40% Tanks + 35% Quick + 25% Basic**

Special spawn pattern:
1. Tanks spawn first (the "bosses")
2. Quick/Basic flood after (support)

---

## Zombie Count by Wave

| Wave | Zombies | Wave | Zombies | Wave | Zombies |
|------|---------|------|---------|------|---------|
| 1 | ~5 | 25 | ~26 | 60 | ~64 |
| 5 | ~8 | 30 | ~31 | 70 | ~70 |
| 10 | ~12 | 40 | ~42 | 80 | ~75 |
| 15 | ~17 | 50 | ~52 | 90 | ~78 |
| 20 | ~21 | | | 100 | ~80 |

---

## Tips for Success

### Early Game (1-25)
- Practice aim and movement
- Learn enemy spawn points
- Build defensive positions with bricks

### Mid Game (26-50)
- Prioritize tanks (high HP)
- Kite quick zombies
- Use weapons efficiently

### Late Game (51-75)
- Always be moving
- Perfect aim required
- Resource management critical

### Endgame (76-100)
- Expert positioning
- No mistakes allowed
- Prestige territory!

---

## Tuning the System

Edit `src/waveManager.ts` lines:

- **Line 7**: `MAX_WAVES = 100` - Change total wave count
- **Line 8**: `COUNTDOWN_SECONDS = 5` - Breathing room between waves
- **Line 9**: `SPAWN_INTERVAL_SECONDS = 2` - Time between spawn groups
- **Line 116**: `baseCount = 8` - Base zombie count
- **Line 120**: `scaleFactor = 1.3` - Difficulty scaling speed
- **Line 124**: `totalZombies = 80` - Max zombies per wave

---

**Good luck surviving all 100 waves!** 🎮🧟‍♂️
