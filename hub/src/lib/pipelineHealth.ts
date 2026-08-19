import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCronRequestAuthorized } from '@/lib/cron-auth'
import { safeErrorMetadata } from '@/lib/safeApiError'

type RouteHandler = (request: Request) => Promise<Response>

async function responseMetadata(response: Response) {
  if (response.ok) return { error: null, details: {} }
  try {
    const body = await response.clone().json() as Record<string, unknown>
    const reason = typeof body.reason === 'string' ? body.reason : `HTTP ${response.status}`
    const details = Object.fromEntries(['deferred', 'stage', 'requiredThroughDate', 'retryAt']
      .filter(key => body[key] !== undefined)
      .map(key => [key, body[key]]))
    return { error: reason.slice(0, 2000), details }
  } catch {
    return { error: `HTTP ${response.status}`, details: {} }
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
        const responseInfo = await responseMetadata(response)
        const status = response.status === 425 ? 'deferred' : response.ok ? 'succeeded' : 'failed'
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
