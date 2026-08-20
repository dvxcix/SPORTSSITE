import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendContactAlertCanary } from '@/lib/contactAlertOutbox'
import { safeApiError } from '@/lib/safeApiError'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const OPERATION = 'contact_alert_media'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

function channelSummary(value: unknown) {
  if (typeof value !== 'string' || !value) return null
  return `...${value.slice(-4)}`
}

export async function GET() {
  const authError = await requireAdmin()
  if (authError) return authError
  const admin = createAdminClient()
  const [configResult, pendingResult, processingResult, failedResult, succeededResult, recentResult] = await Promise.all([
    admin.from('discord_config').select('enabled,alert_channels,updated_at').eq('id', 1).maybeSingle(),
    admin.from('operational_retry_queue').select('id', { count: 'exact', head: true }).eq('provider', 'discord').eq('operation', OPERATION).eq('status', 'pending'),
    admin.from('operational_retry_queue').select('id', { count: 'exact', head: true }).eq('provider', 'discord').eq('operation', OPERATION).eq('status', 'processing'),
    admin.from('operational_retry_queue').select('id', { count: 'exact', head: true }).eq('provider', 'discord').eq('operation', OPERATION).eq('status', 'failed'),
    admin.from('operational_retry_queue').select('id', { count: 'exact', head: true }).eq('provider', 'discord').eq('operation', OPERATION).eq('status', 'succeeded'),
    admin.from('operational_retry_queue')
      .select('id,status,attempts,max_attempts,last_error,response_status,created_at,updated_at,completed_at,payload')
      .eq('provider', 'discord').eq('operation', OPERATION).order('created_at', { ascending: false }).limit(12),
  ])
  const queryError = configResult.error ?? pendingResult.error ?? processingResult.error ?? failedResult.error ?? succeededResult.error ?? recentResult.error
  if (queryError) return safeApiError('admin-discord-contact-alert-health', queryError)

  const config = configResult.data as { enabled?: boolean; alert_channels?: Record<string, string>; updated_at?: string } | null
  const channels = config?.alert_channels ?? {}
  const recent = (recentResult.data ?? []).map(row => {
    const event = (row.payload as { event?: { kind?: string; batterName?: string; gamePk?: number } } | null)?.event
    const createdAt = row.created_at ? new Date(row.created_at).getTime() : NaN
    const completedAt = row.completed_at ? new Date(row.completed_at).getTime() : NaN
    return {
      id: row.id,
      status: row.status,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      lastError: row.last_error,
      responseStatus: row.response_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      latencyMs: Number.isFinite(createdAt) && Number.isFinite(completedAt) ? Math.max(0, completedAt - createdAt) : null,
      kind: event?.kind ?? null,
      batterName: event?.batterName ?? null,
      gamePk: event?.gamePk ?? null,
    }
  })

  return NextResponse.json({
    ready: Boolean(config?.enabled && channels.hr && channels.near_hr),
    enabled: Boolean(config?.enabled),
    channels: {
      hr: { configured: Boolean(channels.hr), id: channelSummary(channels.hr) },
      nearHr: { configured: Boolean(channels.near_hr), id: channelSummary(channels.near_hr) },
    },
    queue: {
      pending: pendingResult.count ?? 0,
      processing: processingResult.count ?? 0,
      failed: failedResult.count ?? 0,
      succeeded: succeededResult.count ?? 0,
    },
    latestSuccessAt: recent.find(row => row.status === 'succeeded')?.completedAt ?? null,
    latestFailureAt: recent.find(row => row.status === 'failed')?.updatedAt ?? null,
    recent,
    recoverySchedule: 'Every minute',
    feedWakeEndpoint: '/api/internal/contact-alert',
  })
}

export async function POST(request: Request) {
  const authError = await requireAdmin()
  if (authError) return authError
  const body = await request.json().catch(() => null) as { kind?: 'hr' | 'near_hr' } | null
  if (body?.kind !== 'hr' && body?.kind !== 'near_hr') {
    return NextResponse.json({ error: 'kind must be hr or near_hr' }, { status: 400 })
  }
  try {
    const result = await sendContactAlertCanary(body.kind)
    return NextResponse.json({ result })
  } catch (error) {
    return safeApiError('admin-discord-contact-alert-test', error)
  }
}
