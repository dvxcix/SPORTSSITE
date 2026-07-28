import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const revalidate = 0

// [id] is gsis_id (nflverse's own stable player key, e.g. "00-0038389") —
// not numeric, unlike MLB's mlb_id, so no Number() coercion here.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()

  const { data: player } = await admin.from('nfl_players').select('*').eq('gsis_id', id).maybeSingle()
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  const { data: team } = player.latest_team
    ? await admin.from('nfl_teams').select('team_abbr, team_name, team_nick, team_conf, team_division, team_color, team_logo_espn').eq('team_abbr', player.latest_team).maybeSingle()
    : { data: null }

  const [{ data: gameLog }, { data: ngsPassing }, { data: ngsReceiving }, { data: ngsRushing }] = await Promise.all([
    admin.from('nfl_player_stats').select('*').eq('player_id', id).order('season', { ascending: false }).order('week', { ascending: false }),
    admin.from('nfl_ngs_passing').select('*').eq('player_gsis_id', id).order('season', { ascending: false }).order('week', { ascending: false }),
    admin.from('nfl_ngs_receiving').select('*').eq('player_gsis_id', id).order('season', { ascending: false }).order('week', { ascending: false }),
    admin.from('nfl_ngs_rushing').select('*').eq('player_gsis_id', id).order('season', { ascending: false }).order('week', { ascending: false }),
  ])

  return NextResponse.json({
    player,
    team,
    gameLog: gameLog ?? [],
    ngsPassing: ngsPassing ?? [],
    ngsReceiving: ngsReceiving ?? [],
    ngsRushing: ngsRushing ?? [],
  })
}
