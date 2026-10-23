import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { createAdminClient } from '@/lib/supabase/admin'
import { nbaToday, PAINT_MARKETS } from '@/lib/nbaPaint'
export const maxDuration = 120
async function run(request: Request) {
  const denied = requireCronAuth(request); if (denied) return denied
  const admin = createAdminClient(), token = randomUUID(), key = 'lease:nba-model-validation', started = Date.now()
  const { data: claimed, error: leaseError } = await admin.rpc('claim_nba_source', { p_key: key, p_token: token, p_seconds: 115 })
  if (leaseError) return NextResponse.json({ reason: 'NBA validation lease unavailable' }, { status: 503 })
  if (!claimed) return NextResponse.json({ reason: 'NBA validation already running' }, { status: 425 })
  try {
    const date = nbaToday(), season = Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 7 ? 1 : 0), validationSeason = season - 1
    const { data: states, error: stateError } = await admin.from('nba_ingestion_state').select('key,complete').in('key', [validationSeason - 2, validationSeason - 1, validationSeason].map(year => `stats:${year}`))
    if (stateError) throw new Error('NBA validation coverage unavailable')
    if (states?.length !== 3 || states.some(state => !state.complete)) return NextResponse.json({ stage: 'waiting-for-history', season: validationSeason })
    const { data: reports, error: reportError } = await admin.from('nba_model_reports').select('market').eq('validation_season', validationSeason).eq('version', 'nba-rolling-v1')
    if (reportError) throw new Error('NBA validation reports unavailable')
    // Opening-three-minute markets require play-by-play validation. The box-score
    // fitter cannot validate them; sending them here permanently retries an invalid RPC.
    const pending = PAINT_MARKETS.filter(market => !market.key.endsWith('_first3min') && !reports?.some(report => report.market === market.key)), results: { market: string; ready: boolean }[] = []
    for (const market of pending) {
      if (Date.now() - started > 75000) break
      const { data, error } = await admin.rpc('fit_nba_production_baseline', { p_market: market.key, p_validation_season: validationSeason }).abortSignal(AbortSignal.timeout(40000))
      if (error) throw new Error(`NBA ${market.key} validation failed (${error.code})`)
      results.push({ market: market.key, ready: data?.ready === true })
    }
    return NextResponse.json({ stage: 'validation', season: validationSeason, modelVersion: 'nba-rolling-v1', results, deferred: pending.length - results.filter(result => result.ready).length })
  } catch (failure) { return NextResponse.json({ reason: failure instanceof Error ? failure.message : 'NBA validation failed' }, { status: 503 }) }
  finally { await admin.from('nba_source_cache').update({ lease_token: null, lease_until: null }).eq('key', key).eq('lease_token', token) }
}
export const GET = withPipelineHealth('nba-model-validate', run)
