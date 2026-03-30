// Lobby / match flow
export const MATCH_MAX_PLAYERS = 5

// Wave loop timing
export const WAVE_ACTIVE_SECONDS = 30
export const WAVE_REST_SECONDS = 10

// Client-side spawn tuning (temporary until full server-authoritative combat entities)
export const CLIENT_SPAWN_INTERVAL_SECONDS = 4
export const CLIENT_BASE_GROUP_SIZE = 2
export const CLIENT_GROUP_GROWTH_EVERY_WAVES = 3
export const CLIENT_MAX_GROUP_SIZE = 6

// Enemy mix progression
export const QUICK_ZOMBIE_UNLOCK_WAVE = 3
export const TANK_ZOMBIE_UNLOCK_WAVE = 7
export const EXPLODER_ZOMBIE_UNLOCK_WAVE = 3
export const QUICK_ZOMBIE_CHANCE = 0.35
export const TANK_ZOMBIE_CHANCE = 0.2
export const EXPLODER_ZOMBIE_BASE_CHANCE = 0.12
export const EXPLODER_ZOMBIE_CHANCE_WAVE_2 = 7
export const EXPLODER_ZOMBIE_CHANCE_WAVE_3 = 13
export const EXPLODER_ZOMBIE_CHANCE_WAVE_4 = 21
export const EXPLODER_ZOMBIE_CHANCE_2 = 0.15
export const EXPLODER_ZOMBIE_CHANCE_3 = 0.2
export const EXPLODER_ZOMBIE_CHANCE_4 = 0.25
export const EXPLODER_ZOMBIE_COOLDOWN_SECONDS = 7
export const EXPLODER_ZOMBIE_MAX_SIMULTANEOUS_EARLY = 1
export const EXPLODER_ZOMBIE_MAX_SIMULTANEOUS_LATE = 2
export const EXPLODER_ZOMBIE_MAX_SIMULTANEOUS_LATE_WAVE = 10

// Brick cost progression (price increases every N waves)
export const BRICK_COST_BASE = 20
export const BRICK_COST_TIER_2 = 35   // starts at wave 5
export const BRICK_COST_TIER_3 = 55   // starts at wave 10
export const BRICK_COST_TIER_4 = 80   // starts at wave 15
export const BRICK_COST_TIER_2_WAVE = 5
export const BRICK_COST_TIER_3_WAVE = 10
export const BRICK_COST_TIER_4_WAVE = 15

// Minigun overheat tuning
export const MINIGUN_OVERHEAT_SECONDS = 6.5
export const MINIGUN_OVERHEAT_LOCK_SECONDS = 3
export const MINIGUN_HEAT_RECOVERY_SECONDS = 3.25
