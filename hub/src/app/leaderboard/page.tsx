import { createClient } from '@/lib/supabase/server'
import { LeaderboardClient } from './LeaderboardClient'

export const revalidate = 120

// Standard Wilson score interval lower bound (95% confidence) — ranks by
// win rate while accounting for sample size, without letting a bad big
// sample beat a good small one the way a hard "5+ picks always ranks
// above fewer" cutoff did (that let a 0-5 record outrank a 1-1 record).
// A higher win% always scores higher than a lower one; sample size only
// breaks ties between comparably-performing records.
function wilsonLowerBound(wins: number, total: number): number {
  if (total === 0) return 0
  const z = 1.96
  const phat = wins / total
  const z2 = z * z
  return (phat + z2 / (2 * total) - z * Math.sqrt((phat * (1 - phat) + z2 / (4 * total)) / total)) / (1 + z2 / total)
}

export default async function LeaderboardPage() {
  const supabase = await createClient()

  const { data: users } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, is_verified, account_type, follower_count, pick_record')
    .limit(100)

  const { data: pickStats } = await supabase
    .from('posts')
    .select('author_id, sport, pick_data, created_at')
    .in('post_type', ['pick', 'parlay'])
    .not('pick_data', 'is', null)

  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

  type SportStats = { wins: number; losses: number; pushes: number }
  const statsByUser: Record<string, {
    wins: number; losses: number; pushes: number
    bySport: Record<string, SportStats>
    thisWeek: { wins: number; losses: number }
    recentResults: ('W' | 'L' | 'P')[]
  }> = {}

  for (const pick of pickStats ?? []) {
    if (!pick.author_id) continue
    if (!statsByUser[pick.author_id]) {
      statsByUser[pick.author_id] = { wins: 0, losses: 0, pushes: 0, bySport: {}, thisWeek: { wins: 0, losses: 0 }, recentResults: [] }
    }
    const s = statsByUser[pick.author_id]
    const result = (pick.pick_data as Record<string, string> | null)?.result
    const sport = pick.sport || 'other'
    if (!s.bySport[sport]) s.bySport[sport] = { wins: 0, losses: 0, pushes: 0 }

    if (result === 'win') {
      s.wins++; s.bySport[sport].wins++
      if (new Date(pick.created_at) > oneWeekAgo) s.thisWeek.wins++
      s.recentResults.unshift('W')
    } else if (result === 'loss') {
      s.losses++; s.bySport[sport].losses++
      if (new Date(pick.created_at) > oneWeekAgo) s.thisWeek.losses++
      s.recentResults.unshift('L')
    } else if (result === 'push') {
      s.pushes++; s.bySport[sport].pushes++
      s.recentResults.unshift('P')
    }
  }

  const ranked = (users ?? []).map(u => {
    const fromPosts = statsByUser[u.id]
    const fromRecord = u.pick_record as { wins?: number; losses?: number; pushes?: number } | null

    // users.pick_record is the authoritative, trigger-maintained total
    // (computed straight from `picks`, correctly excludes picks whose post
    // got deleted) — preferred over re-deriving totals from `pickStats`
    // here. `fromPosts?.wins ?? fromRecord?.wins` used to be the order,
    // but that's backwards AND broken: `0 ?? x` evaluates to 0, not x, so
    // it never actually fell back once a user had any entry in
    // statsByUser at all. fromPosts is still what drives the per-sport/
    // this-week/streak breakdown below, since pick_record doesn't carry
    // that granularity.
    const wins = fromRecord?.wins ?? fromPosts?.wins ?? 0
    const losses = fromRecord?.losses ?? fromPosts?.losses ?? 0
    const pushes = fromRecord?.pushes ?? fromPosts?.pushes ?? 0
    const graded = wins + losses
    const winPct = graded > 0 ? Math.round((wins / graded) * 1000) / 10 : 0

    const recent = (fromPosts?.recentResults ?? []).slice(0, 10)
    let streak = 0
    if (recent.length > 0) {
      const dir = recent[0]
      for (const r of recent) { if (r === dir) streak++; else break }
      if (dir === 'L') streak = -streak
    }

    return {
      id: u.id as string,
      username: u.username as string,
      display_name: u.display_name as string | null,
      avatar_url: u.avatar_url as string | null,
      is_verified: u.is_verified as boolean,
      account_type: u.account_type as string,
      follower_count: (u.follower_count as number) ?? 0,
      wins, losses, pushes,
      total: wins + losses + pushes,
      winPct,
      streak,
      recentResults: recent,
      thisWeek: fromPosts?.thisWeek ?? { wins: 0, losses: 0 },
      bySport: fromPosts?.bySport ?? {},
    }
  }).sort((a, b) => wilsonLowerBound(b.wins, b.wins + b.losses) - wilsonLowerBound(a.wins, a.wins + a.losses)
    || b.follower_count - a.follower_count)

  const allSports = Array.from(new Set((pickStats ?? []).map(p => p.sport).filter(Boolean))) as string[]

  return <LeaderboardClient users={ranked} allSports={allSports} />
}
