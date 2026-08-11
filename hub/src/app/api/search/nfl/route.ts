import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTier } from '@/lib/requireTier'

export const revalidate = 0

// Unlike /api/search/sports (MLB), which has to hit statsapi.mlb.com live
// since this app has no site-owned MLB team/player table, NFL data is our
// own (nfl_teams/nfl_players, synced from nflverse) — a plain ilike against
// our own DB, no external round trip needed.
export async function GET(req: Request) {
  const gate = await requireTier('free')
  if (gate.error) return gate.error
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '')
    .trim()
    .slice(0, 64)
    .replace(/[%_,().\\]/g, '')
  if (q.length < 2) return NextResponse.json({ players: [], teams: [] })

  const admin = createAdminClient()
  const [{ data: players }, { data: teams }, { data: allTeams }] = await Promise.all([
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
    admin.from('nfl_teams').select('team_abbr, team_logo_espn'),
  ])

  // Players don't carry their own logo — the UI shows a team logo next to
  // every player result (not the bare team abbreviation), so merge it in here.
  const logoByAbbr = new Map((allTeams ?? []).map(t => [t.team_abbr, t.team_logo_espn]))
  const playersWithLogo = (players ?? []).map(p => ({ ...p, team_logo_espn: p.latest_team ? logoByAbbr.get(p.latest_team) ?? null : null }))

  return NextResponse.json({ players: playersWithLogo, teams: teams ?? [] }, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  })
}
