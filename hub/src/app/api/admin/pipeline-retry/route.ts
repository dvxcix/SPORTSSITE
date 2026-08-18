import { randomUUID } from 'node:crypto'
import { after, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TRACKED_PIPELINES } from '@/lib/pipelineRegistry'

export const runtime = 'nodejs'
export const maxDuration = 300

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  return data?.account_type === 'admin' ? null : NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function POST(request: Request) {
  const authError = await requireAdmin()
  if (authError) return authError
  const body = await request.json().catch(() => null) as { jobName?: string } | null
  const jobName = body?.jobName ?? ''
  if (!TRACKED_PIPELINES.some(pipeline => pipeline.name === jobName)) return NextResponse.json({ error: 'Unknown pipeline.' }, { status: 400 })
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 503 })
  const runId = randomUUID()
  const origin = new URL(request.url).origin
  after(async () => {
    const response = await fetch(`${origin}/api/cron/${encodeURIComponent(jobName)}`, {
      headers: { Authorization: `Bearer ${secret}`, 'X-SlipSurge-Trigger': 'manual-retry', 'X-SlipSurge-Run': runId },
      signal: AbortSignal.timeout(290_000),
    }).catch(() => null)
    if (!response?.ok) console.error('[pipeline-retry] manual run failed', { jobName, runId, status: response?.status })
  })
  return NextResponse.json({ ok: true, runId }, { status: 202 })
}
