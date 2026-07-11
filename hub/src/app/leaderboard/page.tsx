import { createClient } from '@/lib/supabase/server'
import { LeaderboardClient } from './LeaderboardClient'

export const revalidate = 120

export default async function LeaderboardPage() {
  const supabase = await createClient()

  const { data: users } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, is_verified, account_type, follower_count, pick_record')
    .limit(100)

  const { data: pickStats } = await supabase
    .from('posts')
    .select('author_id, sport, pick_data, created_at')
    .eq('post_type', 'pick')
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

    const wins = fromPosts?.wins ?? fromRecord?.wins ?? 0
    const losses = fromPosts?.losses ?? fromRecord?.losses ?? 0
    const pushes = fromPosts?.pushes ?? fromRecord?.pushes ?? 0
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
  }).sort((a, b) => {
    const aG = a.wins + a.losses, bG = b.wins + b.losses
    if (aG >= 5 && bG < 5) return -1
    if (bG >= 5 && aG < 5) return 1
    if (a.winPct !== b.winPct) return b.winPct - a.winPct
    return b.follower_count - a.follower_count
  })

  const allSports = Array.from(new Set((pickStats ?? []).map(p => p.sport).filter(Boolean))) as string[]

  return <LeaderboardClient users={ranked} allSports={allSports} />
}
