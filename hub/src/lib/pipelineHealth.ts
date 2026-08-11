import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCronRequestAuthorized } from '@/lib/cron-auth'
import { safeErrorMetadata } from '@/lib/safeApiError'

type RouteHandler = (request: Request) => Promise<Response>

export function withPipelineHealth(jobName: string, handler: RouteHandler, options?: { allowSecondarySecret?: boolean }): RouteHandler {
  return async request => {
    if (!isCronRequestAuthorized(request, options?.allowSecondarySecret)) return handler(request)

    const admin = createAdminClient()
    const runId = randomUUID()
    const startedAt = Date.now()
    const startedIso = new Date(startedAt).toISOString()
    const details = { path: new URL(request.url).pathname }

    const { error: startError } = await admin.from('pipeline_runs').insert({
      job_name: jobName, run_id: runId, status: 'running',
      started_at: startedIso, details,
    })
    if (startError) console.error(`[pipeline-health] could not start ${jobName}`, { code: startError.code })

    try {
      const response = await handler(request)
      if (!startError) {
        const { error } = await admin.from('pipeline_runs').update({
          status: response.ok ? 'succeeded' : 'failed',
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt,
          http_status: response.status,
          error: response.ok ? null : `HTTP ${response.status}`,
          details,
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
