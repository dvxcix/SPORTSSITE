import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTier } from '@/lib/requireTier'

export const revalidate = 0

// NFL seasons span two calendar years (Sept–Feb) — same convention as
// nfl-sync-schedule's own currentNflSeason().
function currentNflSeason(): number {
  const now = new Date()
  const year = now.getUTCFullYear()
  return now.getUTCMonth() < 2 ? year - 1 : year
}

// "Current roster" isn't a real column nflverse gives us directly — status
// (e.g. 'ACT') reflects whatever it was as of that player's own last
// recorded season, not necessarily THIS season, so a retired player last
// active in 2015 can still show status='ACT'. Scoping to last_season >=
// the current NFL season is what actually approximates "still around."
export async function GET(_req: Request, { params }: { params: Promise<{ abbr: string }> }) {
  const gate = await requireTier('free')
  if (gate.error) return gate.error
  const { abbr } = await params
  const normalizedAbbr = abbr.trim().toUpperCase()
  if (!/^[A-Z]{2,3}$/.test(normalizedAbbr)) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }
  const admin = createAdminClient()

  const { data: team } = await admin.from('nfl_teams')
    .select('team_abbr,team_name,team_id,team_nick,team_conf,team_division,team_color,team_color2,team_logo_espn,team_logo_wikipedia,team_wordmark,team_logo_squared')
    .eq('team_abbr', normalizedAbbr)
    .maybeSingle()
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const { data: roster } = await admin
    .from('nfl_players')
    .select('gsis_id, display_name, position, position_group, jersey_number, headshot, status, years_of_experience, height, weight, college_name')
    .eq('latest_team', team.team_abbr)
    .gte('last_season', currentNflSeason())
    .order('position_group', { ascending: true })
    .order('display_name', { ascending: true })

  return NextResponse.json({ team, roster: roster ?? [] }, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' },
  })
}
