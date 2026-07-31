import { createAdminClient } from '@/lib/supabase/admin'
import { getTodaysMatchups } from '@slipsurge/core/mlbSchedule'

// One game per day gets unlocked at full Ultimate depth for every signed-in
// member below Ultimate — a sneak peek so Free/Basic/Advanced members see
// what Dugout/Slate Breakdown/etc. actually look like instead of hitting a
// wall on every page. Auto-picks the day's earliest first pitch by default;
// an admin can override it for a specific date via daily_featured_game (e.g.
// to showcase a marquee game instead of a random early getaway-day game).
export async function getFeaturedGameKey(date?: string): Promise<string | null> {
  const d = date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  try {
    const admin = createAdminClient()
    const { data } = await admin.from('daily_featured_game').select('game_key').eq('game_date', d).maybeSingle()
    if (data?.game_key) return data.game_key
  } catch { /* admin client unavailable — fall through to the auto-pick */ }

  const games = await getTodaysMatchups(d)
  if (!games.length) return null
  const sorted = [...games].sort((a, b) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime())
  return sorted[0].gameKey
}
