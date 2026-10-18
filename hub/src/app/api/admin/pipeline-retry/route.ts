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
  const body = await request.json().catch(() => null) as { jobName?: string; action?: string } | null
  const jobName = body?.jobName ?? ''
  if (!TRACKED_PIPELINES.some(pipeline => pipeline.name === jobName)) return NextResponse.json({ error: 'Unknown pipeline.' }, { status: 400 })
  const action = body?.action ?? 'run'
  if (action !== 'run' && !(action === 'fit' && jobName === 'market-dna-maintenance') && !(action === 'preview' && jobName === 'slate-drop')) {
    return NextResponse.json({ error: 'Unsupported pipeline action.' }, { status: 400 })
  }
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 503 })
  const runId = randomUUID()
  const origin = new URL(request.url).origin
  const suffix = action === 'fit' ? '?fitOnly=1' : action === 'preview' ? '?preview=1' : ''
  const url = `${origin}/api/cron/${encodeURIComponent(jobName)}${suffix}`
  if (action === 'preview') {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(25_000),
      })
      return NextResponse.json(await response.json(), { status: response.status })
    } catch {
      return NextResponse.json({ error: 'Slate preview failed.' }, { status: 502 })
    }
  }
  after(async () => {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}`, 'X-SlipSurge-Trigger': 'manual-retry', 'X-SlipSurge-Run': runId },
      signal: AbortSignal.timeout(290_000),
    }).catch(() => null)
    if (!response?.ok) console.error('[pipeline-retry] manual run failed', { jobName, runId, status: response?.status })
  })
  return NextResponse.json({ ok: true, runId }, { status: 202 })
}
