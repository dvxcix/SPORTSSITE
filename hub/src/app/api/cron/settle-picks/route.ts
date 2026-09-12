import { NextResponse } from 'next/server'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { PROP_META } from '@/lib/watchlist'
import { fetchLiveFeed, settleFinalPick } from '@/lib/pickGrading'
import { safeApiError } from '@/lib/safeApiError'
import { applyNflPickResult, gradeNflPick, type NflPendingPick } from '@/lib/nflPickGrading'
import { nflKickoffAt } from '@/app/the-sideline/kickoff'

export const revalidate = 0
export const maxDuration = 60

async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()

  const { data: pending, error } = await admin
    .from('picks')
    .select('id, post_id, game_pk, mlb_id, pick_type, game_date')
    .eq('sport', 'MLB')
    .eq('result', 'pending')
    .not('game_pk', 'is', null)
    .not('mlb_id', 'is', null)

  if (error) return safeApiError('settle-picks-query', error)

  const byGame = new Map<string, typeof pending>()
  for (const p of pending ?? []) {
    if (!byGame.has(p.game_pk)) byGame.set(p.game_pk, [])
    byGame.get(p.game_pk)!.push(p)
  }

  let graded = 0
  let skipped = 0
  const graded_ids: string[] = []
  const skipped_reasons: Record<string, number> = {}

  for (const [gamePk, picks] of byGame.entries()) {
    const feed = await fetchLiveFeed(gamePk)
    const state = feed?.gameData?.status?.abstractGameState
    if (state !== 'Final') {
      skipped += picks.length
      skipped_reasons[state ?? 'unknown'] = (skipped_reasons[state ?? 'unknown'] ?? 0) + picks.length
      continue
    }

    for (const pick of picks) {
      const outcome = await settleFinalPick(admin, pick as any, feed, PROP_META)
      if (!outcome) {
        // Unknown/unsupported pick_type (e.g. pitcher_strikeouts — our
        // composer only offers batter props right now) — left pending
        // rather than guessed.
        skipped++
        skipped_reasons[`unsupported:${pick.pick_type}`] = (skipped_reasons[`unsupported:${pick.pick_type}`] ?? 0) + 1
        continue
      }
      graded++
      graded_ids.push(pick.id)
    }
  }

  const { data: nflPending, error: nflError } = await admin.from('picks')
    .select('id,post_id,game_pk,player_id,player_name,pick_type,market_side,numeric_line')
    .eq('sport', 'NFL').eq('result', 'pending').not('game_pk', 'is', null).not('player_id', 'is', null)
  if (nflError) return safeApiError('settle-nfl-picks-query', nflError)

  const nflByGame = new Map<string, NflPendingPick[]>()
  for (const pick of (nflPending ?? []) as NflPendingPick[]) nflByGame.set(pick.game_pk, [...(nflByGame.get(pick.game_pk) ?? []), pick])
  for (const [gameId, gamePicks] of nflByGame) {
    const { data: game } = await admin.from('nfl_schedule').select('season,week,game_type,gameday,gametime,home_score,away_score').eq('game_id', gameId).maybeSingle()
    if (!game || game.home_score == null || game.away_score == null) { skipped += gamePicks.length; continue }
    const kickoff = nflKickoffAt(game)
    // Scores can appear before a provider's final-state flag reaches our
    // schedule row. Seven hours after kickoff is a conservative final gate and
    // works across EST/EDT without a hard-coded offset.
    const safeFinal = Boolean(kickoff && Date.now() > kickoff.getTime() + 7 * 60 * 60 * 1000)
    if (!safeFinal) { skipped += gamePicks.length; continue }
    const [{ data: stats }, { data: plays }] = await Promise.all([
      admin.from('nfl_player_stats').select('*').eq('season', game.season).eq('week', game.week).eq('season_type', game.game_type),
      admin.from('nfl_pbp').select('play_id,qtr,touchdown,pass_touchdown,rush_touchdown,pass_attempt,rush_attempt,complete_pass,interception,passing_yards,receiving_yards,rushing_yards,passer_player_id,receiver_player_id,rusher_player_id,kickoff_returner_player_id,punt_returner_player_id,fumble_recovery_1_player_id,interception_player_id').eq('game_id', gameId).order('play_id'),
    ])
    for (const pick of gamePicks) {
      const result = gradeNflPick(pick, stats ?? [], plays ?? [])
      if (!result) { skipped++; skipped_reasons[`unsupported:nfl:${pick.pick_type}`] = (skipped_reasons[`unsupported:nfl:${pick.pick_type}`] ?? 0) + 1; continue }
      const applied = await applyNflPickResult(admin, pick, result)
      if (!applied) { skipped++; continue }
      graded++; graded_ids.push(pick.id)
    }
  }

  return NextResponse.json({ graded, skipped, skipped_reasons, graded_ids })
}

export const GET = withPipelineHealth('settle-picks', run)
