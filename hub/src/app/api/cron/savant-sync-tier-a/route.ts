import { NextResponse } from 'next/server'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { currentSeason } from '@/lib/playerSync'
import { SAVANT_TIER_A, upsertSavantCategory } from '@/lib/savantSync'

export const revalidate = 0
export const maxDuration = 60

const CATEGORY_STALE_HOURS = 20

type CategoryResult =
  | { rows: number }
  | { skipped: true }
  | { deferred: true; reason: string }
  | { error: string }

// Runs once daily, ~6am ET (see vercel.json — a fixed UTC hour, so it'll
// drift an hour off 6am ET across the DST changeover until adjusted).
// Savant's own leaderboards only update once a day anyway (not live
// in-game data), so there's nothing to gain from polling more often — this
// just catches yesterday's now-final numbers each morning. Each Savant
// leaderboard is a single request returning every qualified player for
// that category/season at once — unlike the per-player MLB Stats API
// crons, there's no per-player claiming here. The staleness check still
// guards against a manual + scheduled run landing the same day.
async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const season = currentSeason()
  const staleBefore = Date.now() - CATEGORY_STALE_HOURS * 60 * 60_000

  const results: Record<string, CategoryResult> = {}

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
    const { data: job, error: jobError } = await admin
      .from('sync_state')
      .select('last_synced_at')
      .eq('source', 'savant_csv').eq('entity_type', 'savant_category').eq('entity_id', entityId).eq('season', season)
      .maybeSingle()

    if (jobError) {
      console.error('[savant-sync-tier-a] state query failed', { resultKey, code: jobError.code })
      results[resultKey] = { error: 'state query failed' }
      continue
    }

    if (job?.last_synced_at && new Date(job.last_synced_at).getTime() > staleBefore) {
      results[resultKey] = { skipped: true }
      continue
    }

    try {
      const result = await upsertSavantCategory(admin, category, season)
      results[resultKey] = result
      if (result.rows > 0) {
        const { error: stateError } = await admin.from('sync_state').upsert({
          source: 'savant_csv', entity_type: 'savant_category', entity_id: entityId, season,
          status: 'statcast_complete', last_synced_at: new Date().toISOString(),
        }, { onConflict: 'source,entity_type,entity_id,season' })
        if (stateError) throw new Error('Savant category completion-state write failed')
      } else {
        // Savant can return HTTP 200 with an empty CSV while retaining the
        // previously published leaderboard. Preserve that good data and its
        // last-success timestamp, expose the source lag as deferred, and let
        // the next scheduled invocation retry it.
        const hadPriorSuccess = Boolean(job?.last_synced_at)
        console.warn('[savant-sync-tier-a] empty category response', { resultKey, hadPriorSuccess })
        results[resultKey] = hadPriorSuccess
          ? { deferred: true, reason: 'Savant has not published a replacement leaderboard yet' }
          : { error: 'empty category response before the first successful sync' }
        const { error: stateError } = await admin.from('sync_state').upsert({
          source: 'savant_csv', entity_type: 'savant_category', entity_id: entityId, season,
          status: hadPriorSuccess ? 'waiting_upstream' : 'error',
        }, { onConflict: 'source,entity_type,entity_id,season' })
        if (stateError) throw new Error('Savant category error-state write failed')
      }
    } catch (e) {
      console.error('[savant-sync-tier-a] category failed', { resultKey, type: e instanceof Error ? e.name : typeof e })
      results[resultKey] = { error: 'sync failed' }
      const { error: stateError } = await admin.from('sync_state').upsert({
        source: 'savant_csv', entity_type: 'savant_category', entity_id: entityId, season, status: 'error',
      }, { onConflict: 'source,entity_type,entity_id,season' })
      if (stateError) console.error('[savant-sync-tier-a] could not mark category failed', { resultKey, code: stateError.code })
    }
  }

  const failures = Object.entries(results)
    .filter(([, result]) => 'error' in result)
    .map(([category, result]) => ({ category, error: 'error' in result ? result.error : 'sync failed' }))
  const deferredCategories = Object.entries(results)
    .filter(([, result]) => 'deferred' in result)
    .map(([category]) => category)
  if (!failures.length && deferredCategories.length) {
    return NextResponse.json({
      ok: false,
      deferred: true,
      season,
      stage: 'savant-category-publication',
      reason: `${deferredCategories.length} Savant leaderboards are waiting for their next non-empty publication`,
      retryAt: 'next scheduled Tier A sync',
      deferredCategories,
      results,
      failures,
    }, { status: 425 })
  }
  return NextResponse.json(
    { ok: failures.length === 0, season, results, failures },
    { status: failures.length ? 503 : 200 }
  )
}

export const GET = withPipelineHealth('savant-sync-tier-a', run)
