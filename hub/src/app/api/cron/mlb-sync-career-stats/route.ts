import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { claimBatch, markSyncState, toNum, fetchMlbJson } from '@/lib/playerSync'

export const revalidate = 0
export const maxDuration = 60

const BATCH_SIZE = 25

// Career stats aren't season-scoped (season stays 0, matching the
// sync_state sentinel career_stats jobs seeded by mlb-sync-bio) — MLB's own
// `stats=career` endpoint returns one aggregated split regardless of how
// many teams a player has been on, so this is a straight upsert keyed on
// mlb_id alone, no per-team rows.
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const claimed = await claimBatch(admin, 'career_stats', 0, BATCH_SIZE)

  let synced = 0
  let failed = 0

  await Promise.all(claimed.map(async ({ entity_id: mlbIdStr }) => {
    const mlbId = Number(mlbIdStr)
    try {
      const [hitting, pitching] = await Promise.all([
        fetchMlbJson(`https://statsapi.mlb.com/api/v1/people/${mlbId}/stats?stats=career&group=hitting`),
        fetchMlbJson(`https://statsapi.mlb.com/api/v1/people/${mlbId}/stats?stats=career&group=pitching`),
      ])

      const battingStat = hitting.stats?.[0]?.splits?.[0]?.stat
      const pitchingStat = pitching.stats?.[0]?.splits?.[0]?.stat

      if (battingStat) {
        const { error } = await admin.from('player_career_stats_batting').upsert({
          mlb_id: mlbId,
          games_played: battingStat.gamesPlayed ?? null, at_bats: battingStat.atBats ?? null, hits: battingStat.hits ?? null,
          home_runs: battingStat.homeRuns ?? null, rbi: battingStat.rbi ?? null, runs: battingStat.runs ?? null,
          stolen_bases: battingStat.stolenBases ?? null, walks: battingStat.baseOnBalls ?? null, strikeouts: battingStat.strikeOuts ?? null,
          avg: toNum(battingStat.avg), obp: toNum(battingStat.obp), slg: toNum(battingStat.slg), ops: toNum(battingStat.ops),
          raw: battingStat, last_synced_at: new Date().toISOString(),
        }, { onConflict: 'mlb_id' })
        if (error) throw error
      }

      if (pitchingStat) {
        const { error } = await admin.from('player_career_stats_pitching').upsert({
          mlb_id: mlbId,
          games_played: pitchingStat.gamesPlayed ?? null, games_started: pitchingStat.gamesStarted ?? null,
          wins: pitchingStat.wins ?? null, losses: pitchingStat.losses ?? null, saves: pitchingStat.saves ?? null,
          innings_pitched: toNum(pitchingStat.inningsPitched), strikeouts: pitchingStat.strikeOuts ?? null, walks: pitchingStat.baseOnBalls ?? null,
          earned_runs: pitchingStat.earnedRuns ?? null, home_runs_allowed: pitchingStat.homeRuns ?? null,
          era: toNum(pitchingStat.era), whip: toNum(pitchingStat.whip),
          raw: pitchingStat, last_synced_at: new Date().toISOString(),
        }, { onConflict: 'mlb_id' })
        if (error) throw error
      }

      await markSyncState(admin, 'career_stats', String(mlbId), 0, 'mlb_complete')
      synced++
    } catch (e) {
      console.error('[mlb-sync-career-stats] failed', mlbId, e)
      await markSyncState(admin, 'career_stats', String(mlbId), 0, 'error')
      failed++
    }
  }))

  return NextResponse.json({ claimed: claimed.length, synced, failed })
}
