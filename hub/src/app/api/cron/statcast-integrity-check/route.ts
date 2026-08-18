import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { createAdminClient } from '@/lib/supabase/admin'
import { currentSeason } from '@/lib/playerSync'
import { daysAgoET } from '@/lib/savantSplitsSync'
import { alertOnStatcastIntegrityFailure, type StatcastIntegrityResult } from '@/lib/statcastIntegrity'
import { safeApiError } from '@/lib/safeApiError'
import { getMLBSchedule } from '@slipsurge/core/mlb-api'

export const revalidate = 0
export const maxDuration = 60

async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const season = currentSeason()
  const throughDate = daysAgoET(1)
  const [auditResponse, officialSchedule] = await Promise.all([
    admin.rpc('run_statcast_integrity_audit', {
      p_season: season,
      p_through_date: throughDate,
    }),
    getMLBSchedule(throughDate),
  ])
  const { data, error } = auditResponse
  if (error) return safeApiError('statcast-integrity-audit', error)

  let result = data as StatcastIntegrityResult

  // The SQL audit compares against our stored schedule, which catches row
  // loss inside SlipSurge. This independent MLB schedule comparison catches
  // the wider failure mode where both the schedule write and the pitch-log
  // write were missed on the same day. Only officially final games count;
  // postponed or suspended games must not create false missing-data alarms.
  if (officialSchedule.length) {
    const finalGamePks = officialSchedule
      .filter(game => game.status.abstractGameState === 'Final')
      .map(game => game.gamePk)
    const loggedGamePks = new Set<string>()
    const pageSize = 1000
    for (let from = 0; ; from += pageSize) {
      const { data: page, error: pageError } = await admin
        .from('player_pitch_log')
        .select('game_pk')
        .eq('season', season)
        .eq('game_date', throughDate)
        .range(from, from + pageSize - 1)
      if (pageError) return safeApiError('statcast-integrity-official-schedule', pageError)
      for (const row of page ?? []) loggedGamePks.add(String(row.game_pk))
      if ((page?.length ?? 0) < pageSize) break
    }
    const missingGamePks = finalGamePks.filter(gamePk => !loggedGamePks.has(String(gamePk)))
    const checks = {
      ...result.checks,
      official_schedule: {
        source_available: true,
        final_games: finalGamePks.length,
        final_games_without_pitch_log: missingGamePks.length,
        missing_game_pks: missingGamePks,
      },
    }
    const summary = {
      failures: result.summary.failures + missingGamePks.length,
      warnings: result.summary.warnings,
    }
    result = { ...result, checks, summary, status: summary.failures > 0 ? 'failed' : result.status }
    const { error: persistError } = await admin.from('statcast_integrity_runs').update({
      status: result.status,
      summary: result.summary,
      checks: result.checks,
    }).eq('id', result.id)
    if (persistError) return safeApiError('statcast-integrity-persist-official-schedule', persistError)
  } else {
    result = {
      ...result,
      checks: {
        ...result.checks,
        official_schedule: {
          source_available: false,
          final_games: 0,
          final_games_without_pitch_log: 0,
          missing_game_pks: [],
        },
      },
    }
  }
  await alertOnStatcastIntegrityFailure(admin, result)
  return NextResponse.json(result, { status: result.status === 'failed' ? 503 : 200 })
}

export const GET = withPipelineHealth('statcast-integrity-check', run)
