import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const revalidate = 0

// Unlike /api/search/sports (MLB), which has to hit statsapi.mlb.com live
// since this app has no site-owned MLB team/player table, NFL data is our
// own (nfl_teams/nfl_players, synced from nflverse) — a plain ilike against
// our own DB, no external round trip needed.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json({ players: [], teams: [] })

  const admin = createAdminClient()
  const [{ data: players }, { data: teams }] = await Promise.all([
    admin.from('nfl_players')
      .select('gsis_id, display_name, position, latest_team, headshot')
      .ilike('display_name', `%${q}%`)
      .not('latest_team', 'is', null)
      .order('last_season', { ascending: false })
      .limit(8),
    admin.from('nfl_teams')
      .select('team_abbr, team_name, team_nick, team_logo_espn')
      .or(`team_name.ilike.%${q}%,team_nick.ilike.%${q}%,team_abbr.ilike.%${q}%`)
      .limit(5),
  ])

  return NextResponse.json({ players: players ?? [], teams: teams ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}
