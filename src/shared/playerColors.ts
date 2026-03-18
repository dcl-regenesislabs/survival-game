import { Color4, Color3 } from '@dcl/sdk/math'
import { getLobbyState } from '../multiplayer/lobbyClient'

export type BulletColor = { albedo: Color4; emissive: Color3 }

// One color per arena slot (up to 4 players)
const PLAYER_BULLET_COLORS: BulletColor[] = [
  { albedo: Color4.create(0.9, 0.8, 0.1, 1.0), emissive: Color3.create(0.5, 0.4, 0.0) }, // Yellow  – slot 0
  { albedo: Color4.create(0.1, 0.5, 0.9, 1.0), emissive: Color3.create(0.0, 0.2, 0.5) }, // Blue    – slot 1
  { albedo: Color4.create(0.1, 0.8, 0.2, 1.0), emissive: Color3.create(0.0, 0.4, 0.1) }, // Green   – slot 2
  { albedo: Color4.create(0.9, 0.2, 0.2, 1.0), emissive: Color3.create(0.5, 0.0, 0.0) }  // Red     – slot 3
]

const DEFAULT_COLOR = PLAYER_BULLET_COLORS[0]

export function getPlayerBulletColor(address: string): BulletColor {
  const lobbyState = getLobbyState()
  if (!lobbyState) return DEFAULT_COLOR
  const idx = lobbyState.arenaPlayers.findIndex(
    (p) => p.address.toLowerCase() === address.toLowerCase()
  )
  return idx >= 0 ? PLAYER_BULLET_COLORS[idx % PLAYER_BULLET_COLORS.length] : DEFAULT_COLOR
}
