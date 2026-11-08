import type { SupabaseClient } from '@supabase/supabase-js'
import type { NflBrowserSource } from './nflBrowserCapturePolicy'

const START = Date.parse('2026-11-08T17:30:00Z')
const END = Date.parse('2026-11-09T01:20:00Z')

type Plan = { source: NflBrowserSource; id: string; games: readonly string[] }
const afternoon = ['2026_09_HOU_LAC', '2026_09_LV_SF', '2026_09_ARI_SEA', '2026_09_GB_NE'] as const
const evening = '2026_09_TB_CHI'
const plans: readonly Plan[] = [
  { source: 'fanduel', id: 'e0b31c37-8bf5-4f9e-bd8e-bc2880cba40d', games: [afternoon[0]] },
  { source: 'fanduel', id: '07a97304-e968-4ed6-bd58-67d32fc8d0d4', games: [afternoon[1]] },
  { source: 'fanduel', id: 'eee7c16a-e429-4af3-bc98-618c4b3543e5', games: [afternoon[2]] },
  { source: 'fanduel', id: '30c0431a-9015-404a-b2c9-fd837a631d15', games: [afternoon[3]] },
  { source: 'fanduel', id: '7f3f6aa7-f2b6-4c6e-9e43-2fa73d991250', games: [evening] },
  { source: 'public', id: 'a65480bc-958b-4098-a905-55850e0cc11f', games: afternoon },
  { source: 'public', id: '5eedef24-a209-4f46-a25f-462d75e9eaba', games: [evening] },
  { source: 'fanduel', id: '12baecb9-7146-42ed-98a6-ac5963070f57', games: [afternoon[1]] },
]

function active(now: number) {
  return now >= START && now < END
}

/** Only an exact authorized route and game set can select a one-use reservation. */
export function nflRecoveryReservation(source: NflBrowserSource, games: readonly string[], now = Date.now(), requestedId?: string) {
  if (!active(now) || new Set(games).size !== games.length) return undefined
  return plans.find(plan => (!requestedId || plan.id === requestedId) && plan.source === source && plan.games.length === games.length
    && plan.games.every(game => games.includes(game)))?.id
}

export async function nextNflRecoveryBatch(admin: SupabaseClient, source: NflBrowserSource, now: number) {
  if (!active(now)) return undefined
  const { data, error } = await admin.rpc('pending_nfl_nov8_browserbase_recovery')
    .abortSignal(AbortSignal.timeout(5_000))
  if (error || !Array.isArray(data) || data.some(id => !plans.some(plan => plan.id === id))) {
    // Normal dispatch still uses the ordinary ceiling.
    console.warn('[nfl-browser-recovery] Pending allowances unavailable')
    return undefined
  }
  return plans.find(plan => plan.source === source && data.includes(plan.id))
}
