import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { currentSeason, claimBatch, markSyncState, toNum, fetchMlbJson } from '@/lib/playerSync'
import { mlbTeamAbbrById } from '@/lib/mlbTeams'

export const revalidate = 0
export const maxDuration = 60

const BATCH_SIZE = 25

// Fetches both hitting and pitching for every claimed player rather than
// branching on primary position — a pitcher's hitting split just comes back
// empty (no rows to upsert), and this is the only way to not miss two-way
// players. A player can have multiple splits within one season (traded
// mid-year), each becoming its own row keyed by (mlb_id, season, game_type,
// team_id).
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const season = currentSeason()
  const claimed = await claimBatch(admin, 'season_stats', season, BATCH_SIZE)

  let synced = 0
  let failed = 0

  await Promise.all(claimed.map(async ({ entity_id: mlbIdStr }) => {
    const mlbId = Number(mlbIdStr)
    try {
      const [hitting, pitching] = await Promise.all([
        fetchMlbJson(`https://statsapi.mlb.com/api/v1/people/${mlbId}/stats?stats=season&group=hitting&season=${season}`),
        fetchMlbJson(`https://statsapi.mlb.com/api/v1/people/${mlbId}/stats?stats=season&group=pitching&season=${season}`),
      ])

      const battingSplits: any[] = hitting.stats?.[0]?.splits ?? []
      const pitchingSplits: any[] = pitching.stats?.[0]?.splits ?? []

      if (battingSplits.length) {
        const rows = battingSplits.map(s => {
          const st = s.stat ?? {}
          const teamId: number | null = s.team?.id ?? null
          return {
            mlb_id: mlbId, season, game_type: s.gameType ?? 'R', team_id: teamId,
            team_abbr: teamId ? (mlbTeamAbbrById(teamId) ?? null) : null,
            games_played: st.gamesPlayed ?? null, at_bats: st.atBats ?? null, hits: st.hits ?? null,
            home_runs: st.homeRuns ?? null, rbi: st.rbi ?? null, runs: st.runs ?? null,
            stolen_bases: st.stolenBases ?? null, walks: st.baseOnBalls ?? null, strikeouts: st.strikeOuts ?? null,
            avg: toNum(st.avg), obp: toNum(st.obp), slg: toNum(st.slg), ops: toNum(st.ops),
            raw: st, last_synced_at: new Date().toISOString(),
          }
        })
        const { error } = await admin.from('player_season_stats_batting')
          .upsert(rows, { onConflict: 'mlb_id,season,game_type,team_id' })
        if (error) throw error
      }

      if (pitchingSplits.length) {
        const rows = pitchingSplits.map(s => {
          const st = s.stat ?? {}
          const teamId: number | null = s.team?.id ?? null
          return {
            mlb_id: mlbId, season, game_type: s.gameType ?? 'R', team_id: teamId,
            team_abbr: teamId ? (mlbTeamAbbrById(teamId) ?? null) : null,
            games_played: st.gamesPlayed ?? null, games_started: st.gamesStarted ?? null,
            wins: st.wins ?? null, losses: st.losses ?? null, saves: st.saves ?? null,
            innings_pitched: toNum(st.inningsPitched), strikeouts: st.strikeOuts ?? null, walks: st.baseOnBalls ?? null,
            earned_runs: st.earnedRuns ?? null, home_runs_allowed: st.homeRuns ?? null,
            era: toNum(st.era), whip: toNum(st.whip),
            raw: st, last_synced_at: new Date().toISOString(),
          }
        })
        const { error } = await admin.from('player_season_stats_pitching')
          .upsert(rows, { onConflict: 'mlb_id,season,game_type,team_id' })
        if (error) throw error
      }

      await markSyncState(admin, 'season_stats', String(mlbId), season, 'mlb_complete')
      synced++
    } catch (e) {
      console.error('[mlb-sync-season-stats] failed', mlbId, e)
      await markSyncState(admin, 'season_stats', String(mlbId), season, 'error')
      failed++
    }
  }))

  return NextResponse.json({ season, claimed: claimed.length, synced, failed })
}
