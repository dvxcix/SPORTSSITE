import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCronRequestAuthorized } from '@/lib/cron-auth'
import { safeErrorMetadata } from '@/lib/safeApiError'

type RouteHandler = (request: Request) => Promise<Response>

type ResponseMetadata = { error: string | null; details: Record<string, unknown>; status?: 'failed' | 'deferred' }

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
  return { error: issues[0] ?? null, details: { nba: { ...counts, issues } }, ...(issues.length ? { status: failed ? 'failed' as const : 'deferred' as const } : {}) }
}

async function responseMetadata(response: Response, jobName: string): Promise<ResponseMetadata> {
  const settlementJob = ['grade-live-picks', 'settle-picks'].includes(jobName)
  const detailedJob = jobName.startsWith('nfl-sync-') || ['nba-research-sync', 'nba-model-validate', 'nba-research-snapshot', 'nba-market-capture', 'poll-pikkit-nba-picks', 'poll-fanduel-nfl', 'poll-pikkit-nfl-picks', 'market-dna-maintenance', 'slate-drop', 'research-mechanics-precompute'].includes(jobName)
  if (response.ok && !detailedJob && !settlementJob) return { error: null, details: {} }
  try {
    const body = await response.clone().json() as Record<string, unknown>
    if (response.ok && settlementJob) return settlementMetadata(body)
    if (response.ok) return { error: null, details: Object.fromEntries(['checked', 'captured', 'unchanged', 'failed', 'unavailable', 'due', 'cleanupIssues', 'reason', 'graded', 'games', 'deferred', 'pages', 'rows', 'remaining', 'synced', 'season', 'coverage', 'results', 'gamesComputed', 'windowsComputed', 'stage', 'modelVersion', 'trainingRows', 'trainedThrough', 'queued', 'alreadyQueued', 'skipped'].filter(key => body[key] !== undefined).map(key => [key, body[key]])) }
    const reason = typeof body.reason === 'string' ? body.reason : Array.isArray(body.cleanupIssues)&&typeof body.cleanupIssues[0]==='string'?body.cleanupIssues[0]:`HTTP ${response.status}`
    const details = Object.fromEntries(['cleanupIssues', 'unavailable', 'deferred', 'stage', 'requiredThroughDate', 'retryAt', 'failed', 'due', 'results', 'coverage', 'gamesWaiting', 'gamesComputed', 'windowsComputed']
      .filter(key => body[key] !== undefined)
      .map(key => [key, body[key]]))
    return { error: reason.slice(0, 2000), details }
  } catch {
    return { error: `HTTP ${response.status}`, details: {}, ...(settlementJob && response.ok ? { status: 'failed' as const } : {}) }
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
