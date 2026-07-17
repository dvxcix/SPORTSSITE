import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { currentSeason } from '@/lib/playerSync'
import { SAVANT_TIER_A, upsertSavantCategory } from '@/lib/savantSync'

export const revalidate = 0
export const maxDuration = 60

const CATEGORY_STALE_HOURS = 20

// Runs once daily, ~6am ET (see vercel.json — a fixed UTC hour, so it'll
// drift an hour off 6am ET across the DST changeover until adjusted).
// Savant's own leaderboards only update once a day anyway (not live
// in-game data), so there's nothing to gain from polling more often — this
// just catches yesterday's now-final numbers each morning. Each Savant
// leaderboard is a single request returning every qualified player for
// that category/season at once — unlike the per-player MLB Stats API
// crons, there's no per-player claiming here. The staleness check still
// guards against a manual + scheduled run landing the same day.
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const season = currentSeason()
  const staleBefore = Date.now() - CATEGORY_STALE_HOURS * 60 * 60_000

  const results: Record<string, { rows: number } | { skipped: true } | { error: string }> = {}

  for (const category of SAVANT_TIER_A) {
    // Keyed by name+target, not just name — home_runs and
    // statcast_quality_of_contact each have separate hitting/pitching
    // SAVANT_TIER_A entries sharing the same `name`. Keying by name alone
    // meant the hitting entry's freshly-set timestamp made the pitching
    // entry (processed moments later, same invocation) look "already
    // synced" and skip itself every single run — confirmed live:
    // player_statcast_pitching_season stayed empty for both categories
    // even after real production runs.
    const resultKey = `${category.name}:${category.target}`
    const entityId = resultKey
    const { data: job } = await admin
      .from('sync_state')
      .select('last_synced_at')
      .eq('source', 'savant_csv').eq('entity_type', 'savant_category').eq('entity_id', entityId).eq('season', season)
      .maybeSingle()

    if (job?.last_synced_at && new Date(job.last_synced_at).getTime() > staleBefore) {
      results[resultKey] = { skipped: true }
      continue
    }

    try {
      results[resultKey] = await upsertSavantCategory(admin, category, season)
      await admin.from('sync_state').upsert({
        source: 'savant_csv', entity_type: 'savant_category', entity_id: entityId, season,
        status: 'statcast_complete', last_synced_at: new Date().toISOString(),
      }, { onConflict: 'source,entity_type,entity_id,season' })
    } catch (e: any) {
      console.error('[savant-sync-tier-a] category failed', resultKey, e)
      results[resultKey] = { error: e?.message || String(e) }
      await admin.from('sync_state').upsert({
        source: 'savant_csv', entity_type: 'savant_category', entity_id: entityId, season, status: 'error',
      }, { onConflict: 'source,entity_type,entity_id,season' })
    }
  }

  return NextResponse.json({ season, results })
}
