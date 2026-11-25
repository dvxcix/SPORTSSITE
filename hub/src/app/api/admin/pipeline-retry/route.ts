import { randomUUID } from 'node:crypto'
import { after, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminDecisionActor } from '@/lib/supabase/adminDecisionActor'
import { TRACKED_PIPELINES } from '@/lib/pipelineRegistry'
import { isMlbCronPaused, mlbPausedResponse } from '@/lib/mlbOffseason'
import { PLATFORM_URL } from '@/lib/platform'
import { getUpcomingNflPikkitGames } from '@/lib/nflPikkitSchedule'
import { nflVerifiedNoCreateDenial } from '@/lib/nflBrowserCapturePolicy'
import { getNflBrowserScope, registerNflBrowserBatch, releaseNflBrowserAttempt, reserveNflPublicLateRefresh } from '@/lib/nflBrowserCaptureControls'

export const runtime = 'nodejs'
export const maxDuration = 650

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  return data?.account_type === 'admin' ? null : NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

async function refreshNflGame(gameId: string, secret: string) {
  const game = (await getUpcomingNflPikkitGames(1)).find(item => item.gameId === gameId)
  if (!game) return NextResponse.json({ error: 'Upcoming NFL game not found.' }, { status: 404 })
  const admin = createAdminClient()
  const scope = await getNflBrowserScope(admin, 'public', game)
  const reservation = await reserveNflPublicLateRefresh(admin, scope, Date.now())
  if (!reservation) return NextResponse.json({ error: 'This game is outside the capture window or its first late attempt is already reserved.' }, { status: 409 })

  let batchId: string
  try {
    batchId = await registerNflBrowserBatch(admin, 'public', [gameId], [reservation])
  } catch (error) {
    await releaseNflBrowserAttempt(admin, reservation).catch(() => false)
    throw error
  }
  const url = new URL('/api/cron/scrape-pikkit-nfl', PLATFORM_URL)
  url.search = new URLSearchParams({ gameId, batch: batchId }).toString()
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}`, 'X-SlipSurge-Trigger': 'manual-retry' },
    redirect: 'error', signal: AbortSignal.timeout(305_000),
  })
  const result = await response.json().catch(() => null)
  if (nflVerifiedNoCreateDenial(response.status, result, 'public')) {
    const released = await releaseNflBrowserAttempt(admin, reservation).catch(() => false)
    if (!released) return NextResponse.json({ error: 'Browser deferral recorded. Reservation release could not be confirmed.' }, { status: 502 })
    return NextResponse.json({ error: result.reason === 'context-busy' ? 'The shared picks browser is in use.' : 'The existing browser budget deferred this capture.' }, { status: response.status })
  }
  if (!response.ok || result?.gameId !== gameId || !result?.imported?.ok || typeof result.imported.capturedAt !== 'string') {
    return NextResponse.json({ error: 'The collector did not confirm a fresh pick import.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true, gameId, capturedAt: result.imported.capturedAt, markets: result.imported.markets })
}

export async function POST(request: Request) {
  const native = request.headers.has('authorization') ? await adminDecisionActor(request) : null
  const authError = native ? native.error : await requireAdmin()
  if (authError) return authError
  const body = await request.json().catch(() => null) as { jobName?: string; action?: string; gameId?: unknown } | null
  const jobName = body?.jobName ?? ''
  if (!TRACKED_PIPELINES.some(pipeline => pipeline.name === jobName)) return NextResponse.json({ error: 'Unknown pipeline.' }, { status: 400 })
  if (isMlbCronPaused(jobName)) return mlbPausedResponse(503)
  const action = body?.action ?? 'run'
  if (action === 'nfl-game' && jobName === 'poll-pikkit-nfl-picks') {
    if (!native && request.headers.get('origin') !== new URL(request.url).origin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const gameId = body?.gameId
    if (typeof gameId !== 'string' || !/^\d{4}_\d{1,2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(gameId)) {
      return NextResponse.json({ error: 'Enter one NFL game ID.' }, { status: 400 })
    }
    const secret = process.env.CRON_SECRET
    if (!secret) return NextResponse.json({ error: 'The cloud collector is unavailable.' }, { status: 503 })
    try {
      return await refreshNflGame(gameId, secret)
    } catch {
      console.error('[pipeline-retry] NFL refresh unconfirmed', { gameId })
      return NextResponse.json({ error: 'The NFL refresh could not be confirmed.' }, { status: 502 })
    }
  }
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
      signal: AbortSignal.timeout(action === 'fit' ? 620_000 : 290_000),
    }).catch(() => null)
    if (!response?.ok) console.error('[pipeline-retry] manual run failed', { jobName, runId, status: response?.status })
  })
  return NextResponse.json({ ok: true, runId }, { status: 202 })
}
