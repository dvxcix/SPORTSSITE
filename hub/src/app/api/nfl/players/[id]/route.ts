import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTier } from '@/lib/requireTier'

export const revalidate = 0

// [id] is gsis_id (nflverse's own stable player key, e.g. "00-0038389") —
// not numeric, unlike MLB's mlb_id, so no Number() coercion here.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTier('free')
  if (gate.error) return gate.error
  const { id } = await params
  if (!/^00-\d{7}$/.test(id)) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  }
  const admin = createAdminClient()

  const { data: player } = await admin.from('nfl_players')
    .select('gsis_id,display_name,first_name,last_name,short_name,football_name,position_group,position,height,weight,headshot,college_name,jersey_number,birth_date,rookie_season,last_season,latest_team,status,years_of_experience,draft_year,draft_round,draft_pick,draft_team,espn_id,pfr_id,nfl_id,updated_at')
    .eq('gsis_id', id)
    .maybeSingle()
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  const { data: team } = player.latest_team
    ? await admin.from('nfl_teams').select('team_abbr, team_name, team_nick, team_conf, team_division, team_color, team_logo_espn').eq('team_abbr', player.latest_team).maybeSingle()
    : { data: null }

  const [{ data: gameLog }, { data: ngsPassing }, { data: ngsReceiving }, { data: ngsRushing }] = await Promise.all([
    admin.from('nfl_player_stats').select('player_id,season,week,season_type,player_name,player_display_name,position,position_group,headshot_url,recent_team,opponent_team,completions,attempts,passing_yards,passing_tds,interceptions,sacks,passing_air_yards,passing_yards_after_catch,passing_first_downs,passing_epa,carries,rushing_yards,rushing_tds,rushing_first_downs,rushing_epa,receptions,targets,receiving_yards,receiving_tds,receiving_air_yards,receiving_yards_after_catch,receiving_first_downs,receiving_epa,target_share,air_yards_share,wopr,special_teams_tds,fantasy_points,fantasy_points_ppr').eq('player_id', id).order('season', { ascending: false }).order('week', { ascending: false }).limit(100),
    admin.from('nfl_ngs_passing').select('player_gsis_id,season,week,season_type,team_abbr,avg_time_to_throw,avg_completed_air_yards,avg_intended_air_yards,avg_air_yards_differential,aggressiveness,max_completed_air_distance,avg_air_yards_to_sticks,attempts,pass_yards,pass_touchdowns,interceptions,passer_rating,completions,completion_percentage,expected_completion_percentage,completion_percentage_above_expectation').eq('player_gsis_id', id).order('season', { ascending: false }).order('week', { ascending: false }).limit(100),
    admin.from('nfl_ngs_receiving').select('player_gsis_id,season,week,season_type,team_abbr,avg_cushion,avg_separation,avg_intended_air_yards,percent_share_of_intended_air_yards,receptions,targets,catch_percentage,yards,rec_touchdowns,avg_yac,avg_expected_yac,avg_yac_above_expectation').eq('player_gsis_id', id).order('season', { ascending: false }).order('week', { ascending: false }).limit(100),
    admin.from('nfl_ngs_rushing').select('player_gsis_id,season,week,season_type,team_abbr,efficiency,percent_attempts_gte_eight_defenders,avg_time_to_los,rush_attempts,rush_yards,avg_rush_yards,rush_touchdowns,expected_rush_yards,rush_yards_over_expected,rush_yards_over_expected_per_att,rush_pct_over_expected').eq('player_gsis_id', id).order('season', { ascending: false }).order('week', { ascending: false }).limit(100),
  ])

  return NextResponse.json({
    player,
    team,
    gameLog: gameLog ?? [],
    ngsPassing: ngsPassing ?? [],
    ngsReceiving: ngsReceiving ?? [],
    ngsRushing: ngsRushing ?? [],
  }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } })
}
