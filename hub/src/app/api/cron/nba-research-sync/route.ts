import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { createAdminClient } from '@/lib/supabase/admin'
import { runNbaIngestion } from '@/lib/nbaIngestion'
export const maxDuration = 60
async function run(request: Request) {
  const denied = requireCronAuth(request); if (denied) return denied
  const admin = createAdminClient(), token = randomUUID(), key = 'lease:historical-ingestion'
  const { data: current, error: cacheError } = await admin.from('nba_source_cache').select('payload,expires_at').eq('key', key).maybeSingle()
  if (cacheError) return NextResponse.json({ reason: 'NBA import freshness unavailable' }, { status: 503 })
  if (current?.payload && current.expires_at && Date.parse(current.expires_at) > Date.now()) return NextResponse.json({ stage: 'rolling-sources-current', coverage: current.payload })
  const { data, error } = await admin.rpc('claim_nba_source', { p_key: key, p_token: token, p_seconds: 90 })
  if (error) return NextResponse.json({ reason: 'NBA import lease unavailable' }, { status: 503 })
  if (!data) return NextResponse.json({ reason: 'NBA import already running' }, { status: 425 })
  try {
    const result = await runNbaIngestion()
    if (!result.remaining.length) {
      const { data: saved, error: saveError } = await admin.rpc('finish_nba_source', { p_key: key, p_token: token, p_payload: result, p_ttl: 900 })
      if (saveError || !saved) throw new Error('NBA import freshness could not save')
    }
    return NextResponse.json(result)
  }
  catch (failure) { return NextResponse.json({ reason: failure instanceof Error ? failure.message : 'NBA import failed' }, { status: 503 }) }
  finally { await admin.from('nba_source_cache').update({ lease_until: null, lease_token: null }).eq('key', key).eq('lease_token', token) }
}
export const GET = withPipelineHealth('nba-research-sync', run)
