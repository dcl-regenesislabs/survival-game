import { Storage } from '@dcl/sdk/server'

const KILLS_KEY = 'leaderboard_kills_v2'
const WAVES_KEY = 'leaderboard_waves_v2'
const MAX_ENTRIES = 10

export type LeaderboardEntry = {
  address: string
  displayName: string
  value: number
}

export class LeaderboardStore {
  private killsTop: LeaderboardEntry[] = []
  private wavesTop: LeaderboardEntry[] = []

  async load(): Promise<void> {
    try {
      const [killsRaw, wavesRaw] = await Promise.all([
        Storage.get<string>(KILLS_KEY),
        Storage.get<string>(WAVES_KEY)
      ])
      if (killsRaw) {
        this.killsTop = this.parseEntries(killsRaw)
      }
      if (wavesRaw) {
        this.wavesTop = this.parseEntries(wavesRaw)
      }
      console.log(`[Server][Leaderboard] Loaded: ${this.killsTop.length} kills, ${this.wavesTop.length} waves entries`)
    } catch (error) {
      console.error('[Server][Leaderboard] Failed to load:', error)
    }
  }

  update(type: 'kills' | 'waves', address: string, displayName: string, value: number): boolean {
    const list = type === 'kills' ? this.killsTop : this.wavesTop
    return this.updateTop(list, address, displayName, value)
  }

  async persist(): Promise<void> {
    try {
      await Promise.all([
        Storage.set(KILLS_KEY, JSON.stringify(this.killsTop)),
        Storage.set(WAVES_KEY, JSON.stringify(this.wavesTop))
      ])
      console.log('[Server][Leaderboard] Persisted')
    } catch (error) {
      console.error('[Server][Leaderboard] Failed to persist:', error)
    }
  }

  getKillsTop(): LeaderboardEntry[] {
    return this.killsTop
  }

  getWavesTop(): LeaderboardEntry[] {
    return this.wavesTop
  }

  private parseEntries(raw: string): LeaderboardEntry[] {
    try {
      const parsed = JSON.parse(raw) as unknown[]
      if (!Array.isArray(parsed)) return []
      return parsed
        .filter((e): e is LeaderboardEntry => !!e && typeof (e as LeaderboardEntry).address === 'string')
        .map((e) => ({
          address: e.address.toLowerCase(),
          displayName: typeof e.displayName === 'string' && e.displayName ? e.displayName : e.address.slice(0, 8),
          value: typeof e.value === 'number' && Number.isFinite(e.value) ? e.value : 0
        }))
        .slice(0, MAX_ENTRIES)
    } catch {
      return []
    }
  }

  private updateTop(list: LeaderboardEntry[], address: string, displayName: string, value: number): boolean {
    if (value <= 0) return false
    const normalized = address.toLowerCase()
    const existing = list.find((e) => e.address === normalized)
    if (existing) {
      if (value <= existing.value) return false
      existing.value = value
      existing.displayName = displayName
    } else {
      if (list.length >= MAX_ENTRIES && value <= (list[list.length - 1]?.value ?? 0)) return false
      list.push({ address: normalized, displayName, value })
    }
    list.sort((a, b) => b.value - a.value)
    if (list.length > MAX_ENTRIES) list.splice(MAX_ENTRIES)
    return true
  }
}

export function createLeaderboardStore(): LeaderboardStore {
  return new LeaderboardStore()
}
