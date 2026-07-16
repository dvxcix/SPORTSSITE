import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { currentSeason } from '@/lib/playerSync'
import { SAVANT_TIER_A, upsertSavantCategory } from '@/lib/savantSync'

export const revalidate = 0
export const maxDuration = 60

const CATEGORY_STALE_HOURS = 20

// Each Savant leaderboard is a single request returning every qualified
// player for that category/season at once — unlike the per-player MLB
// Stats API crons, there's no per-player claiming here. This just re-pulls
// whichever Tier A categories haven't synced in the last ~20h, all in one
// tick (5 categories, cheap enough not to need spreading across ticks the
// way per-player batching does).
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const season = currentSeason()
  const staleBefore = Date.now() - CATEGORY_STALE_HOURS * 60 * 60_000

  const results: Record<string, { rows: number } | { skipped: true } | { error: string }> = {}

  for (const category of SAVANT_TIER_A) {
    const { data: job } = await admin
      .from('sync_state')
      .select('last_synced_at')
      .eq('source', 'savant_csv').eq('entity_type', 'savant_category').eq('entity_id', category.name).eq('season', season)
      .maybeSingle()

    if (job?.last_synced_at && new Date(job.last_synced_at).getTime() > staleBefore) {
      results[category.name] = { skipped: true }
      continue
    }

    try {
      results[category.name] = await upsertSavantCategory(admin, category, season)
      await admin.from('sync_state').upsert({
        source: 'savant_csv', entity_type: 'savant_category', entity_id: category.name, season,
        status: 'statcast_complete', last_synced_at: new Date().toISOString(),
      }, { onConflict: 'source,entity_type,entity_id,season' })
    } catch (e: any) {
      console.error('[savant-sync-tier-a] category failed', category.name, e)
      results[category.name] = { error: e?.message || String(e) }
      await admin.from('sync_state').upsert({
        source: 'savant_csv', entity_type: 'savant_category', entity_id: category.name, season, status: 'error',
      }, { onConflict: 'source,entity_type,entity_id,season' })
    }
  }

  return NextResponse.json({ season, results })
}
