import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCronRequestAuthorized } from '@/lib/cron-auth'
import { safeErrorMetadata } from '@/lib/safeApiError'

type RouteHandler = (request: Request) => Promise<Response>

type ResponseMetadata = { error: string | null; details: Record<string, unknown>; status?: 'failed' | 'deferred'; recordsProcessed?: number }

function mlbPublicCaptureMetadata(body: Record<string, unknown>, response: Response): ResponseMetadata {
  const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
  const countKeys = ['games', 'pregame', 'due', 'browserSessions', 'succeeded', 'failed', 'skipped', 'rowsImported']
  const counts = Object.fromEntries(countKeys.filter(key => isCount(body[key])).map(key => [key, body[key] as number]))
  const incomplete = Object.keys(counts).length !== countKeys.length
    || counts.pregame > counts.games || counts.due > counts.pregame
    || counts.succeeded + counts.failed !== counts.due || counts.skipped > counts.failed
    || (counts.due === 0 && ['browserSessions', 'succeeded', 'failed', 'skipped', 'rowsImported'].some(key => counts[key] !== 0))
    || (counts.due > 0 && counts.failed === 0 && (counts.succeeded !== counts.due || counts.rowsImported === 0))
  const failed = !response.ok || incomplete || counts.failed > 0
  const reason = incomplete ? 'capture-report-incomplete' : failed ? 'capture-failed'
    : counts.pregame === 0 ? 'no-pregame-games' : counts.due === 0 ? 'no-captures-due' : 'captures-imported'
  const decisionReasons = new Set(['manual-force', 'lineup-final-ready', 'lineup-final-missing', 'started-or-invalid', 'fresh-for-current-slot', 't-10h', 't-4h'])
  const decisions = (Array.isArray(body.decisions) ? body.decisions : []).slice(0, 30).flatMap(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    const item = value as Record<string, unknown>
    if (!isCount(item.gamePk) || typeof item.gameKey !== 'string' || !/^[A-Z0-9]{2,4}@[A-Z0-9]{2,4}(?:-G\d)?$/.test(item.gameKey)) return []
    const capture = item.capture && typeof item.capture === 'object' && !Array.isArray(item.capture)
      ? item.capture as Record<string, unknown> : {}
    return [{
      gamePk: item.gamePk, gameKey: item.gameKey, due: item.due === true,
      reason: typeof item.reason === 'string' && decisionReasons.has(item.reason) ? item.reason : 'unknown',
      slotHours: item.slotHours === 4 || item.slotHours === 10 ? item.slotHours : null,
      targetAt: typeof item.targetAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(item.targetAt) ? item.targetAt : null,
      capture: {
        capturedAt: isCount(capture.capturedAt) ? capture.capturedAt : null,
        ...Object.fromEntries(['marketCount', 'playerCount', 'rowCount'].filter(key => isCount(capture[key])).map(key => [key, capture[key]])),
        complete: capture.complete === true, hasHomeRuns: capture.hasHomeRuns === true,
      },
    }]
  })
  // Persist counts and bounded schedule decisions, never raw provider errors,
  // import payloads, credentials, or player-level results.
  return {
    error: failed ? (incomplete ? 'MLB public capture report incomplete' : 'MLB public capture failed') : null,
    details: { ...counts, reason, decisions },
    ...(isCount(body.rowsImported) ? { recordsProcessed: body.rowsImported } : {}),
    ...(failed ? { status: 'failed' as const } : {}),
  }
}

function settlementMetadata(body: Record<string, unknown>): ResponseMetadata {
  const value = body.nba
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'NBA settlement report missing', details: {}, status: 'failed' }
  const nba = value as Record<string, unknown>
  const counts = Object.fromEntries(['claimed', 'attempted', 'checked', 'graded', 'skipped'].filter(key => typeof nba[key] === 'number' && Number.isSafeInteger(nba[key]) && (nba[key] as number) >= 0).map(key => [key, nba[key]]))
  const knownIssues = new Set(['NBA pending picks unavailable', 'NBA time budget reached', 'NBA atomic settlement failed', 'NBA final data unavailable', 'NBA attempt checkpoint failed', 'NBA period 0 final stats incomplete', 'NBA period 1 final stats incomplete'])
  const issues = Array.isArray(nba.issues) ? [...new Set(nba.issues.map(issue => typeof issue === 'string' && knownIssues.has(issue) ? issue : 'NBA settlement issue'))] : ['NBA settlement report incomplete']
  if (Object.keys(counts).length !== 5 && !issues.includes('NBA settlement report incomplete')) issues.push('NBA settlement report incomplete')
  const failed = issues.some(issue => !['NBA time budget reached', 'NBA final data unavailable', 'NBA period 0 final stats incomplete', 'NBA period 1 final stats incomplete'].includes(issue))
  // Never copy graded_ids, notified IDs, player names, or arbitrary error text
  // into the operational ledger. HTTP success can still contain partial work.
  const details: Record<string, unknown> = { nba: { ...counts, issues } }
  let sportFailed = false, sportDeferred = false
  const sportIssues: string[] = []
  const safeReasons = new Set(['graded', 'not-final', 'unsupported-contract', 'missing-contract', 'missing-player', 'missing-stats', 'missing-plays', 'missing-statcast', 'pending-unavailable', 'source-unavailable', 'time-budget', 'write-failed', 'checkpoint-failed', 'invalid-identity', 'notification-failed', 'already-settled'])
  const deferredReasons = new Set(['not-final', 'missing-stats', 'missing-plays', 'missing-statcast', 'missing-player', 'source-unavailable', 'time-budget'])
  for (const sport of ['mlb', 'nfl']) {
    const raw = body[sport]
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { sportFailed = true; sportIssues.push(`${sport.toUpperCase()} settlement report missing`); continue }
    const report = raw as Record<string, unknown>
    const metrics = Object.fromEntries(['claimed', 'attempted', 'checked', 'graded', 'skipped', 'won'].filter(key => typeof report[key] === 'number' && Number.isSafeInteger(report[key]) && (report[key] as number) >= 0).map(key => [key, report[key]]))
    const reasons = report.reasons && typeof report.reasons === 'object' && !Array.isArray(report.reasons)
      ? Object.fromEntries(Object.entries(report.reasons).filter(([key, value]) => safeReasons.has(key) && typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)) : {}
    const currentIssues = Array.isArray(report.issues) ? [...new Set(report.issues.map(issue => typeof issue === 'string' && safeReasons.has(issue) ? issue : 'settlement-issue'))] : ['report-incomplete']
    if (Object.keys(metrics).length !== 6) currentIssues.push('report-incomplete')
    else if (Number(metrics.attempted) > Number(metrics.claimed) || Number(metrics.checked) > Number(metrics.attempted)
      || Number(metrics.graded) > Number(metrics.checked) || Number(metrics.won) > Number(metrics.graded)
      || Number(metrics.graded) + Number(metrics.skipped) !== Number(metrics.claimed)) currentIssues.push('report-incomplete')
    if (currentIssues.some(issue => !deferredReasons.has(issue))) sportFailed = true
    if (currentIssues.length) sportDeferred = true
    sportIssues.push(...currentIssues.map(issue => `${sport.toUpperCase()} ${issue}`))
    details[sport] = { ...metrics, reasons, issues: currentIssues }
  }
  return { error: sportIssues[0] ?? issues[0] ?? null, details, ...(sportFailed || failed ? { status: 'failed' as const } : sportDeferred || issues.length ? { status: 'deferred' as const } : {}) }
}

async function responseMetadata(response: Response, jobName: string): Promise<ResponseMetadata> {
  const settlementJob = ['grade-live-picks', 'settle-picks'].includes(jobName)
  const mlbPublicCaptureJob = jobName === 'poll-pikkit-picks'
  const detailedJob = jobName.startsWith('nfl-sync-') || ['nba-research-sync', 'nba-model-validate', 'nba-research-snapshot', 'nba-market-capture', 'nba-book-first-capture', 'poll-pikkit-nba-picks', 'poll-fanduel-nfl', 'poll-pikkit-nfl-picks', 'market-dna-maintenance', 'slate-drop', 'research-mechanics-precompute'].includes(jobName)
  if (response.ok && !detailedJob && !settlementJob && !mlbPublicCaptureJob) return { error: null, details: {} }
  try {
    const body = await response.clone().json() as Record<string, unknown>
    if (mlbPublicCaptureJob) return mlbPublicCaptureMetadata(body, response)
    if (response.ok && settlementJob) return settlementMetadata(body)
    if (response.ok) return { error: null, details: Object.fromEntries(['checked', 'captured', 'unchanged', 'failed', 'unavailable', 'due', 'cleanupIssues', 'reason', 'graded', 'games', 'deferred', 'pages', 'rows', 'remaining', 'synced', 'season', 'coverage', 'results', 'gamesComputed', 'windowsComputed', 'stage', 'modelVersion', 'trainingRows', 'trainedThrough', 'queued', 'alreadyQueued', 'skipped', ...(jobName === 'nba-market-capture' ? ['firstBasket'] : []), ...(jobName === 'nba-book-first-capture' ? ['books', 'saved', 'checked'] : [])].filter(key => body[key] !== undefined).map(key => [key, body[key]])) }
    const reason = typeof body.reason === 'string' ? body.reason : Array.isArray(body.cleanupIssues)&&typeof body.cleanupIssues[0]==='string'?body.cleanupIssues[0]:`HTTP ${response.status}`
    const details = Object.fromEntries(['cleanupIssues', 'unavailable', 'deferred', 'stage', 'requiredThroughDate', 'retryAt', 'failed', 'due', 'results', 'coverage', 'gamesWaiting', 'gamesComputed', 'windowsComputed', ...(jobName === 'nba-market-capture' ? ['firstBasket'] : []), ...(jobName === 'nba-book-first-capture' ? ['books', 'saved', 'checked'] : [])]
      .filter(key => body[key] !== undefined)
      .map(key => [key, body[key]]))
    return { error: reason.slice(0, 2000), details }
  } catch {
    return { error: `HTTP ${response.status}`, details: {}, ...((settlementJob || mlbPublicCaptureJob) && response.ok ? { status: 'failed' as const } : {}) }
  }
}

export function withPipelineHealth(jobName: string, handler: RouteHandler, options?: { allowSecondarySecret?: boolean }): RouteHandler {
  return async request => {
    if (!isCronRequestAuthorized(request, options?.allowSecondarySecret)) return handler(request)

    const admin = createAdminClient()
    const runId = randomUUID()
    const startedAt = Date.now()
    const startedIso = new Date(startedAt).toISOString()
    const details = {
      path: new URL(request.url).pathname,
      trigger: request.headers.get('x-slipsurge-trigger') ?? 'scheduled',
      deployment_id: process.env.VERCEL_DEPLOYMENT_ID ?? null,
      git_sha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
    }

    // A serverless timeout terminates the process before the catch block can
    // close its ledger row. Expire abandoned runs when the next invocation
    // starts so the admin dashboard never reports a days-old job as running.
    const abandonedBefore = new Date(startedAt - 15 * 60_000).toISOString()
    const { error: abandonedError } = await admin.from('pipeline_runs').update({
      status: 'failed',
      finished_at: startedIso,
      error: 'Execution ended without a completion signal (timeout or termination)',
      details: { ...details, recovered_by_run_id: runId },
    }).eq('job_name', jobName).eq('status', 'running').lt('started_at', abandonedBefore)
    if (abandonedError) console.error(`[pipeline-health] could not expire abandoned ${jobName} runs`, { code: abandonedError.code })

    const { error: startError } = await admin.from('pipeline_runs').insert({
      job_name: jobName, run_id: runId, status: 'running',
      started_at: startedIso, details,
    })
    if (startError) console.error(`[pipeline-health] could not start ${jobName}`, { code: startError.code })

    try {
      const response = await handler(request)
      if (!startError) {
        const responseInfo = await responseMetadata(response, jobName)
        const status = response.status === 425 ? 'deferred' : response.ok ? responseInfo.status ?? 'succeeded' : 'failed'
        const { error } = await admin.from('pipeline_runs').update({
          status,
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt,
          http_status: response.status,
          ...(responseInfo.recordsProcessed !== undefined ? { records_processed: responseInfo.recordsProcessed } : {}),
          error: responseInfo.error,
          details: { ...details, ...responseInfo.details },
        }).eq('run_id', runId).eq('job_name', jobName)
        if (error) console.error(`[pipeline-health] could not finish ${jobName}`, { code: error.code })
      }
      return response
    } catch (error) {
      const metadata = safeErrorMetadata(error)
      const message = Object.keys(metadata).length ? JSON.stringify(metadata) : 'Unhandled failure'
      const failure = {
        status: 'failed', finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt, error: message.slice(0, 2000), details,
      }
      const { error: insertError } = startError
        ? await admin.from('pipeline_runs').insert({ job_name: jobName, run_id: runId, started_at: startedIso, ...failure })
        : await admin.from('pipeline_runs').update(failure).eq('run_id', runId).eq('job_name', jobName)
      if (insertError) console.error(`[pipeline-health] could not record failure for ${jobName}`, { code: insertError.code })
      throw error
    }
  }
}
