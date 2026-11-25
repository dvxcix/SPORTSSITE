import { NextResponse } from 'next/server'
import { browserbasePlanUsage, getBrowserbaseUsageSummary } from '@/lib/browserbaseUsage'
import { isMlbCronPaused } from '@/lib/mlbOffseason'
import { TRACKED_PIPELINES } from '@/lib/pipelineRegistry'
import { adminDecisionActor } from '@/lib/supabase/adminDecisionActor'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers })
const pipelineFields = 'id,job_name,status,started_at,finished_at,duration_ms,http_status,details'
export const maxDuration = 30

export async function GET(request: Request) {
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const anchor = Date.now()
  const day = new Date(anchor - 86_400_000).toISOString()
  const stalled = new Date(anchor - 600_000).toISOString()
  const slow = TRACKED_PIPELINES.filter(job => job.staleAfterMinutes > 12).map(job => job.name)
  const admin = actor.admin
  try {
    const [recent, slowerRuns, integrity, browser, webhooks, stalledWebhooks, push, reports, applications, exports, failedExports,
      recap, failedRecap, retries, failedRetries] = await Promise.all([
      admin.from('pipeline_runs').select(pipelineFields).order('started_at', { ascending: false }).order('id', { ascending: false }).limit(250),
      admin.from('pipeline_runs').select(pipelineFields).in('job_name', slow).order('started_at', { ascending: false }).order('id', { ascending: false }).limit(1000),
      admin.from('statcast_integrity_runs').select('status,through_date,summary,checks,created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      getBrowserbaseUsageSummary().catch(() => null),
      admin.from('provider_webhook_events').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      admin.from('provider_webhook_events').select('id', { count: 'exact', head: true }).eq('status', 'processing').lt('updated_at', stalled),
      admin.from('notification_delivery_attempts').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('attempted_at', day),
      admin.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      admin.from('creator_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      admin.from('data_export_requests').select('id', { count: 'exact', head: true }).in('status', ['queued', 'processing', 'ready']),
      admin.from('data_export_requests').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      admin.from('contact_recap_export_jobs').select('id', { count: 'exact', head: true }).in('status', ['queued', 'running', 'retrying']),
      admin.from('contact_recap_export_jobs').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      admin.from('operational_retry_queue').select('id', { count: 'exact', head: true }).in('status', ['pending', 'processing']),
      admin.from('operational_retry_queue').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    ])
    if (recent.error || slowerRuns.error) throw Error('Pipeline runs unavailable')
    const all = [...new Map([...(recent.data ?? []), ...(slowerRuns.data ?? [])].map(run => [run.id, run])).values()]
      .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at) || b.id - a.id)
    const jobs = TRACKED_PIPELINES.map(job => {
      const runs = all.filter(run => run.job_name === job.name).slice(0, 8).map(run => ({
        id: run.id, status: run.status, startedAt: run.started_at, finishedAt: run.finished_at, duration: run.duration_ms, http: run.http_status,
        stage: typeof run.details?.stage === 'string' && /^[a-z0-9_: -]{1,80}$/i.test(run.details.stage) ? run.details.stage : null,
      }))
      const latest = runs[0], paused = isMlbCronPaused(job.name)
      const age = latest ? (anchor - Date.parse(latest.startedAt)) / 60_000 : Infinity
      const state = paused ? 'paused' : !latest ? 'unknown' : latest.status === 'running' && age > Math.min(job.staleAfterMinutes, 10) ? 'timed_out'
        : latest.status === 'failed' ? 'failed' : age > job.staleAfterMinutes ? 'stale' : latest.status
      return { id: job.name, name: job.label, schedule: job.schedule, section: job.area, paused, state, runs }
    })
    const value = integrity.data
    const audit = value ? { status: value.status, through: value.through_date, createdAt: value.created_at, failures: value.summary?.failures ?? null,
      warnings: value.summary?.warnings ?? null, pitches: value.checks?.pitch_log?.rows ?? null,
      games: value.checks?.pitch_log?.games ?? null, homeRuns: value.checks?.pitch_log?.home_runs ?? null } : null
    const counts = { webhooks, stalledWebhooks, push, reports, applications, exports, failedExports, recap, failedRecap, retries, failedRetries }
    const budget = browser ? { ...browserbasePlanUsage(browser), runningSessions: browser.runningSessions, workflows: browser.byWorkflow.slice(0, 8) } : null
    return reply({ jobs, queues: Object.entries(counts).map(([id, result]) => ({ id, count: result.error ? null : result.count })),
      audit, budget, checkedAt: new Date(anchor).toISOString() })
  } catch {
    return reply({ error: 'Pipeline health could not be loaded' }, 503)
  }
}
