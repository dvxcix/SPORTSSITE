import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { postToChannelChecked } from '@/lib/discord'
import { requireCronAuth } from '@/lib/cron-auth'
import { withPipelineHealth } from '@/lib/pipelineHealth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function run(request: Request) {
  const authError = requireCronAuth(request)
  if (authError) return authError
  const admin = createAdminClient()
  const now = new Date().toISOString()
  // Recover work claimed by an invocation that was terminated mid-delivery.
  await admin.from('operational_retry_queue').update({
    status: 'pending',
    next_attempt_at: now,
    last_error: 'Recovered after an interrupted replay.',
    updated_at: now,
  }).eq('status', 'processing').lt('updated_at', new Date(Date.now() - 10 * 60_000).toISOString())
  const { data: items, error } = await admin.from('operational_retry_queue')
    .select('id,provider,operation,payload,attempts,max_attempts')
    .eq('status', 'pending')
    .lte('next_attempt_at', now)
    .order('next_attempt_at', { ascending: true })
    .limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let succeeded = 0
  let failed = 0
  for (const item of items ?? []) {
    const { data: claimed } = await admin.from('operational_retry_queue')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', item.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()
    if (!claimed) continue
    const payload = item.payload as { channelId?: string; payload?: { content?: string; embeds?: unknown[] } }
    let result: { ok: boolean; error?: string } = { ok: false, error: `No replay handler for ${item.provider}:${item.operation}` }
    if (item.provider === 'discord' && item.operation === 'post_channel_message' && payload.channelId && payload.payload) {
      result = await postToChannelChecked(payload.channelId, payload.payload)
    }
    const attempts = Number(item.attempts || 0) + 1
    if (result.ok) {
      succeeded += 1
      await admin.from('operational_retry_queue').update({ status: 'succeeded', attempts, completed_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq('id', item.id)
    } else {
      failed += 1
      const exhausted = attempts >= Number(item.max_attempts || 5)
      await admin.from('operational_retry_queue').update({
        status: exhausted ? 'failed' : 'pending',
        attempts,
        last_error: result.error ?? 'Replay failed',
        next_attempt_at: new Date(Date.now() + Math.min(2 ** attempts * 60_000, 60 * 60_000)).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', item.id)
    }
  }
  return NextResponse.json({ ok: true, processed: items?.length ?? 0, succeeded, failed })
}

export const GET = withPipelineHealth('replay-operational-retries', run)
