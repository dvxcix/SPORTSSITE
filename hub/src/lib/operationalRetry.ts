import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export async function enqueueOperationalRetry(input: {
  provider: 'discord' | 'pikkit' | 'whop'
  operation: string
  payload: Record<string, unknown>
  error: string
  responseStatus?: number | null
}) {
  try {
    const admin = createAdminClient()
    const dedupeKey = createHash('sha256')
      .update(`${input.provider}:${input.operation}:${JSON.stringify(input.payload)}`)
      .digest('hex')
    // The active dedupe constraint is a partial unique index. A plain insert
    // lets Postgres enforce it correctly; PostgREST upsert cannot target a
    // partial index unless it can also express the index predicate.
    const { error } = await admin.from('operational_retry_queue').insert({
      provider: input.provider,
      operation: input.operation,
      payload: input.payload,
      status: 'pending',
      next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
      last_error: input.error.slice(0, 2000),
      response_status: input.responseStatus ?? null,
      dedupe_key: dedupeKey,
      updated_at: new Date().toISOString(),
    })
    if (error && error.code !== '23505') console.error('[operational-retry] enqueue failed', { provider: input.provider, code: error.code })
  } catch (error) {
    console.error('[operational-retry] enqueue unavailable', { type: error instanceof Error ? error.name : typeof error })
  }
}
