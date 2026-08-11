import { NextResponse } from 'next/server'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { safeApiError } from '@/lib/safeApiError'

export const revalidate = 0
export const maxDuration = 30

// lineup_confirmed notifications are only ever meaningful for the day
// they fire (a confirmed lineup or a postponed-game alert from a week ago
// is noise, not history) — but every one of the cron's broadcasts has
// stuck around forever, since nothing ever deleted them. Confirmed live:
// 113,515 of the notifications table's 125,756 total rows (90%) were this
// one type, going back 12 days, in a 45MB table. Runs once daily; a
// 3-day window (not 1) is a deliberate buffer against timezone edges and
// anyone who hasn't opened the app in a day or two.
async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const now = Date.now()
  const lineupCutoff = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString()
  const readCutoff = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString()
  const absoluteCutoff = new Date(now - 180 * 24 * 60 * 60 * 1000).toISOString()
  const telemetryCutoff = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()
  const webhookCutoff = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString()

  const results = await Promise.all([
    admin.from('notifications').delete({ count: 'exact' }).eq('type', 'lineup_confirmed').lt('created_at', lineupCutoff),
    admin.from('notifications').delete({ count: 'exact' }).eq('read', true).neq('type', 'lineup_confirmed').gte('created_at', absoluteCutoff).lt('created_at', readCutoff),
    admin.from('notifications').delete({ count: 'exact' }).lt('created_at', absoluteCutoff),
    admin.from('notification_delivery_attempts').delete({ count: 'exact' }).lt('attempted_at', telemetryCutoff),
    admin.from('pipeline_runs').delete({ count: 'exact' }).lt('started_at', telemetryCutoff),
    admin.from('provider_webhook_events').delete({ count: 'exact' }).lt('received_at', webhookCutoff),
  ])
  const failure = results.find(result => result.error)
  if (failure?.error) return safeApiError('prune-notifications', failure.error)

  return NextResponse.json({
    ok: true,
    deleted: {
      staleLineups: results[0].count ?? 0,
      oldRead: results[1].count ?? 0,
      expired: results[2].count ?? 0,
      deliveryAttempts: results[3].count ?? 0,
      pipelineRuns: results[4].count ?? 0,
      webhookReceipts: results[5].count ?? 0,
    },
    cutoffs: { lineupCutoff, readCutoff, absoluteCutoff, telemetryCutoff, webhookCutoff },
  })
}

export const GET = withPipelineHealth('prune-notifications', run)
