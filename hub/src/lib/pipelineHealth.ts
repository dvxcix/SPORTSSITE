import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

type RouteHandler = (request: Request) => Promise<Response>

export function withPipelineHealth(jobName: string, handler: RouteHandler): RouteHandler {
  return async request => {
    const admin = createAdminClient()
    const runId = randomUUID()
    const startedAt = Date.now()

    try {
      const response = await handler(request)
      // Authentication stays inside each route. Do not create service-role
      // telemetry rows for rejected public requests.
      if (response.status !== 401 && response.status !== 403) {
        const { error } = await admin.from('pipeline_runs').insert({
          job_name: jobName,
          run_id: runId,
          status: response.ok ? 'succeeded' : 'failed',
          started_at: new Date(startedAt).toISOString(),
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt,
          http_status: response.status,
          error: response.ok ? null : `HTTP ${response.status}`,
          details: { path: new URL(request.url).pathname },
        })
        if (error) console.error(`[pipeline-health] could not finish ${jobName}`, error)
      }
      return response
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const { error: insertError } = await admin.from('pipeline_runs').insert({
        job_name: jobName, run_id: runId, status: 'failed',
        started_at: new Date(startedAt).toISOString(), finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt, error: message.slice(0, 2000),
        details: { path: new URL(request.url).pathname },
      })
      if (insertError) console.error(`[pipeline-health] could not record failure for ${jobName}`, insertError)
      throw error
    }
  }
}
