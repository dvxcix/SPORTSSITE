/* eslint-disable react-hooks/purity -- This dynamic server page intentionally calculates request-time pipeline freshness. */
import Link from 'next/link'
import { Activity, AlertTriangle, Bell, CheckCircle2, Clock3, Download, Gauge, RotateCcw, Webhook, XCircle, type LucideIcon } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { TRACKED_PIPELINES } from '@/lib/pipelineRegistry'
import { PipelineRetryButton } from './PipelineRetryButton'

export const dynamic = 'force-dynamic'

type Run = {
  id: number
  job_name: string
  status: 'running' | 'succeeded' | 'failed' | 'deferred'
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  http_status: number | null
  error: string | null
  details: { deployment_id?: string | null; git_sha?: string | null; trigger?: string | null; stage?: string | null; requiredThroughDate?: string | null; retryAt?: string | null } | null
}

type DataEvidence = {
  observedAt: string | null
  detail: string
  currentOutput?: boolean
}

type IntegrityRun = {
  status: 'healthy' | 'warning' | 'failed'
  through_date: string
  summary: { failures?: number; warnings?: number } | null
  checks: {
    pitch_log?: { rows?: number; games?: number; fair_balls?: number; home_runs?: number; source_unavailable_fair_ball_metrics?: Record<string, number> }
    game_coverage?: { scheduled_games_without_pitch_log?: number }
    home_run_enrichment?: { missing_detail_events?: number; canonical_fallback_home_runs?: number }
    category_freshness?: { stale_categories?: number }
    official_schedule?: { source_available?: boolean; final_games?: number; final_games_without_pitch_log?: number; missing_game_pks?: number[] }
  } | null
  created_at: string
}

function easternDateOffset(days: number) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  const date = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + days))
  return date.toISOString().slice(0, 10)
}

function firstTimestamp(data: unknown, field: string) {
  if (!Array.isArray(data) || data.length === 0) return null
  const value = (data[0] as Record<string, unknown>)[field]
  return typeof value === 'string' ? value : null
}

function ageLabel(date: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return hours < 48 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
}

function currentTimestamp() {
  return Date.now()
}

function durationLabel(ms: number | null, status: Run['status']) {
  if (ms == null) return status === 'running' ? 'Running' : 'No duration'
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
}

function nextRunLabel(schedule: string) {
  const match = schedule.match(/Every (\d+) minutes?/i)
  if (match) return `within ${match[1]}m`
  if (/Every minute/i.test(schedule)) return 'within 1m'
  if (/Hourly/i.test(schedule)) return 'within 1h'
  if (/Daily/i.test(schedule)) return 'next daily window'
  return 'event-driven'
}

export default async function PipelineHealthPage() {
  const admin = createAdminClient()
  const sinceYesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const completedMlbDate = easternDateOffset(-1)
  const currentMlbDate = easternDateOffset(0)
  // Minute-level jobs can fill the global history window before lower-frequency
  // jobs appear. Fetch those slower jobs in a second bounded query so their
  // most recent run is always represented without loading the full run ledger.
  const lowerFrequencyPipelineNames = TRACKED_PIPELINES
    .filter(pipeline => pipeline.staleAfterMinutes > 12)
    .map(pipeline => pipeline.name)
  const [
    { data, error },
    { data: lowerFrequencyData },
    { count: failedWebhooks },
    { count: processingWebhooks },
    { count: failedPushes },
    { count: pendingReports },
    { count: pendingCreatorApplications },
    { count: openExports },
    { count: failedExports },
    { count: activeRecapExports },
    { count: failedRecapExports },
    { count: pendingOperationalRetries },
    { count: failedOperationalRetries },
  ] = await Promise.all([
    admin.from('pipeline_runs').select('id,job_name,status,started_at,finished_at,duration_ms,http_status,error,details').order('started_at', { ascending: false }).limit(250),
    admin.from('pipeline_runs').select('id,job_name,status,started_at,finished_at,duration_ms,http_status,error,details').in('job_name', lowerFrequencyPipelineNames).order('started_at', { ascending: false }).limit(2_000),
    admin.from('provider_webhook_events').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    admin.from('provider_webhook_events').select('id', { count: 'exact', head: true }).eq('status', 'processing').lt('updated_at', new Date(Date.now() - 10 * 60_000).toISOString()),
    admin.from('notification_delivery_attempts').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('attempted_at', sinceYesterday),
    admin.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('creator_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('data_export_requests').select('id', { count: 'exact', head: true }).in('status', ['queued', 'processing', 'ready']),
    admin.from('data_export_requests').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    admin.from('contact_recap_export_jobs').select('id', { count: 'exact', head: true }).in('status', ['queued', 'running', 'retrying']),
    admin.from('contact_recap_export_jobs').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    admin.from('operational_retry_queue').select('id', { count: 'exact', head: true }).in('status', ['pending', 'processing']),
    admin.from('operational_retry_queue').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
  ])
  const runs = [...((data ?? []) as Run[]), ...((lowerFrequencyData ?? []) as Run[])]
  const { data: integrityData } = await admin
    .from('statcast_integrity_runs')
    .select('status,through_date,summary,checks,created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const integrity = integrityData as IntegrityRun | null
  const sourceUnavailable = Object.values(integrity?.checks?.pitch_log?.source_unavailable_fair_ball_metrics ?? {})
    .reduce((sum, value) => sum + Number(value || 0), 0)
  const latest = new Map<string, Run>()
  for (const run of runs.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())) {
    if (!latest.has(run.job_name)) latest.set(run.job_name, run)
  }

  // Execution telemetry and data freshness are separate signals. Verify the
  // actual production outputs before reporting that a daily MLB job has not run.
  const freshnessSources = [
    { job: 'savant-sync-tier-a', field: 'last_synced_at', detail: 'Core Savant season tables', query: admin.from('player_statcast_hitting_season').select('last_synced_at').order('last_synced_at', { ascending: false }).limit(1) },
    { job: 'savant-sync-bat-tracking', field: 'last_synced_at', detail: 'Bat-tracking splits', query: admin.from('player_statcast_splits').select('last_synced_at').eq('category', 'bat_tracking').order('last_synced_at', { ascending: false }).limit(1) },
    { job: 'savant-sync-batted-ball', field: 'last_synced_at', detail: 'Batted-ball splits', query: admin.from('player_statcast_splits').select('last_synced_at').eq('category', 'batted_ball_splits').order('last_synced_at', { ascending: false }).limit(1) },
    { job: 'savant-sync-swing-take', field: 'last_synced_at', detail: 'Swing-and-take splits', query: admin.from('player_statcast_splits').select('last_synced_at').eq('category', 'swing_take').order('last_synced_at', { ascending: false }).limit(1) },
    { job: 'savant-sync-swing-timing', field: 'last_synced_at', detail: 'Swing-timing splits', query: admin.from('player_statcast_splits').select('last_synced_at').eq('category', 'swing_timing_miss_distance').order('last_synced_at', { ascending: false }).limit(1) },
    { job: 'savant-sync-batting-stance', field: 'last_synced_at', detail: 'Batting-stance splits', query: admin.from('player_statcast_splits').select('last_synced_at').eq('category', 'batting_stance').order('last_synced_at', { ascending: false }).limit(1) },
    { job: 'savant-sync-swing-path', field: 'last_synced_at', detail: 'Swing-path splits', query: admin.from('player_statcast_splits').select('last_synced_at').eq('category', 'swing_path_attack_angle').order('last_synced_at', { ascending: false }).limit(1) },
    { job: 'savant-sync-hr-details', field: 'last_synced_at', detail: 'HR and near-HR detail', query: admin.from('player_home_run_events').select('last_synced_at').order('last_synced_at', { ascending: false }).limit(1) },
    { job: 'savant-sync-pitch-arsenal-stats', field: 'last_synced_at', detail: 'Pitch-arsenal splits', query: admin.from('player_statcast_splits').select('last_synced_at').eq('category', 'pitch_arsenal_stats').order('last_synced_at', { ascending: false }).limit(1) },
    { job: 'savant-sync-pitch-arsenal-details', field: 'last_synced_at', detail: 'Pitch-arsenal events', query: admin.from('player_pitch_arsenal_events').select('last_synced_at').order('last_synced_at', { ascending: false }).limit(1) },
    { job: 'savant-sync-pitch-log', field: 'last_synced_at', detail: `${completedMlbDate} game pitch logs`, query: admin.from('games').select('last_synced_at').eq('game_date', completedMlbDate).order('last_synced_at', { ascending: false }).limit(1) },
    { job: 'pitch-log-freshness-check', field: 'last_synced_at', detail: `${completedMlbDate} game pitch logs`, query: admin.from('games').select('last_synced_at').eq('game_date', completedMlbDate).order('last_synced_at', { ascending: false }).limit(1) },
    { job: 'savant-sync-affinity', field: 'updated_at', detail: 'Pitcher affinity profiles', query: admin.from('pitcher_affinity_profiles').select('updated_at').order('updated_at', { ascending: false }).limit(1) },
    { job: 'dugout-statcast-precompute', field: 'computed_at', detail: 'Dugout Statcast cache', query: admin.from('dugout_statcast_precomputed').select('computed_at').eq('game_date', currentMlbDate).order('computed_at', { ascending: false }).limit(1) },
    { job: 'dugout-matchup-edge-precompute', field: 'computed_at', detail: 'Dugout matchup cache', query: admin.from('dugout_matchup_edge_precomputed').select('computed_at').eq('game_date', currentMlbDate).order('computed_at', { ascending: false }).limit(1) },
    { job: 'dugout-pitchlog-stat-precompute', field: 'updated_at', detail: 'Dugout pitch-log cache', query: admin.from('dugout_pitchlog_stat_precomputed').select('updated_at').eq('game_date', currentMlbDate).order('updated_at', { ascending: false }).limit(1) },
    { job: 'research-mechanics-precompute', field: 'computed_at', detail: 'HR mechanics window cache', query: admin.from('research_mechanics_snapshots').select('computed_at').eq('game_date', currentMlbDate).order('computed_at', { ascending: false }).limit(1) },
  ]
  const freshnessResults = await Promise.all(freshnessSources.map(async source => ({ source, result: await source.query })))
  const dataEvidence = new Map<string, DataEvidence>()
  for (const { source, result } of freshnessResults) {
    const observedAt = result.error ? null : firstTimestamp(result.data, source.field)
    if (observedAt) dataEvidence.set(source.job, { observedAt, detail: source.detail })
  }
  const { data: seasonAverageOutput } = await admin.from('dugout_season_avg_precomputed').select('game_date').eq('game_date', currentMlbDate).limit(1)
  if (seasonAverageOutput?.length) {
    dataEvidence.set('dugout-season-avg-precompute', { observedAt: null, detail: `${currentMlbDate} season-average cache`, currentOutput: true })
  }
  if (integrity?.created_at) {
    dataEvidence.set('statcast-integrity-check', { observedAt: integrity.created_at, detail: `Full-season audit through ${integrity.through_date}` })
  }

  const now = new Date()
  const lineupCutoff = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const readCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const absoluteCutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString()
  const telemetryCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const webhookCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const retentionChecks = await Promise.all([
    admin.from('notifications').select('id', { count: 'exact', head: true }).eq('type', 'lineup_confirmed').lt('created_at', lineupCutoff),
    admin.from('notifications').select('id', { count: 'exact', head: true }).eq('read', true).neq('type', 'lineup_confirmed').gte('created_at', absoluteCutoff).lt('created_at', readCutoff),
    admin.from('notifications').select('id', { count: 'exact', head: true }).lt('created_at', absoluteCutoff),
    admin.from('notification_delivery_attempts').select('id', { count: 'exact', head: true }).lt('attempted_at', telemetryCutoff),
    admin.from('pipeline_runs').select('id', { count: 'exact', head: true }).lt('started_at', telemetryCutoff),
    admin.from('provider_webhook_events').select('id', { count: 'exact', head: true }).lt('received_at', webhookCutoff),
  ])
  if (retentionChecks.every(check => !check.error && (check.count ?? 0) === 0)) {
    dataEvidence.set('prune-notifications', { observedAt: null, detail: 'All retention windows are clear', currentOutput: true })
  }

  const rows = TRACKED_PIPELINES.map(pipeline => {
    const run = latest.get(pipeline.name)
    const evidence = dataEvidence.get(pipeline.name)
    const ageMinutes = run ? (currentTimestamp() - new Date(run.started_at).getTime()) / 60_000 : Infinity
    const evidenceAgeMinutes = evidence?.observedAt ? (currentTimestamp() - new Date(evidence.observedAt).getTime()) / 60_000 : Infinity
    const evidenceIsCurrent = Boolean(evidence?.currentOutput || (evidence?.observedAt && evidenceAgeMinutes <= pipeline.staleAfterMinutes))
    const timedOut = run?.status === 'running' && ageMinutes > Math.min(10, pipeline.staleAfterMinutes)
    const state = timedOut
      ? 'timed_out'
      : run?.status === 'failed'
      ? 'failed'
      : run && ageMinutes <= pipeline.staleAfterMinutes
        ? run.status
        : evidenceIsCurrent
          ? 'verified'
          : run
            ? 'stale'
            : 'waiting'
    return { pipeline, run, evidence, state }
  })
  const healthy = rows.filter(row => row.state === 'succeeded' || row.state === 'verified').length
  const problems = rows.filter(row => row.state === 'failed' || row.state === 'stale' || row.state === 'timed_out').length
  const deferred = rows.filter(row => row.state === 'deferred').length

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-cyan-400"><Activity size={14} /> Operations</div>
          <h1 className="text-2xl font-black text-white">Pipeline health</h1>
          <p className="mt-1 text-sm text-zinc-400">Live execution status for production-critical data, alerts and billing jobs.</p>
        </div>
        <p className="text-right text-xs text-zinc-500">Release <span className="font-mono text-zinc-300">{process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? 'local'}</span><br/>Refreshes with the page</p>
      </div>

      {error && <div className="mb-5 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><XCircle size={16} /> Health data could not be loaded.</div>}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4"><p className="text-xs text-zinc-500">Healthy</p><p className="mt-1 text-2xl font-black text-emerald-400">{healthy}</p></div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4"><p className="text-xs text-zinc-500">Waiting upstream</p><p className="mt-1 text-2xl font-black text-amber-300">{deferred}</p></div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4"><p className="text-xs text-zinc-500">Needs attention</p><p className="mt-1 text-2xl font-black text-amber-400">{problems}</p></div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4"><p className="text-xs text-zinc-500">Instrumented</p><p className="mt-1 text-2xl font-black text-white">{TRACKED_PIPELINES.length}</p></div>
      </div>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Operational queues">
        <QueueCard icon={Webhook} label="Webhook failures" value={(failedWebhooks ?? 0) + (processingWebhooks ?? 0)} detail={`${processingWebhooks ?? 0} stalled · ${failedWebhooks ?? 0} failed`} tone={(failedWebhooks ?? 0) + (processingWebhooks ?? 0) > 0 ? 'danger' : 'success'} />
        <QueueCard icon={Bell} label="Push failures, 24h" value={failedPushes ?? 0} detail="Per-device delivery attempts" tone={(failedPushes ?? 0) > 0 ? 'warning' : 'success'} />
        <QueueCard icon={AlertTriangle} label="Review queues" value={(pendingReports ?? 0) + (pendingCreatorApplications ?? 0)} detail={`${pendingReports ?? 0} reports · ${pendingCreatorApplications ?? 0} creators`} href="/admin/reports" tone={(pendingReports ?? 0) > 0 ? 'warning' : 'neutral'} />
        <QueueCard icon={Download} label="Data exports" value={(openExports ?? 0) + (failedExports ?? 0)} detail={`${openExports ?? 0} open · ${failedExports ?? 0} failed`} tone={(failedExports ?? 0) > 0 ? 'danger' : 'neutral'} />
      </section>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <QueueCard icon={RotateCcw} label="Delivery replay queue" value={(pendingOperationalRetries ?? 0) + (failedOperationalRetries ?? 0)} detail={`${pendingOperationalRetries ?? 0} retrying · ${failedOperationalRetries ?? 0} exhausted`} tone={(failedOperationalRetries ?? 0) > 0 ? 'danger' : (pendingOperationalRetries ?? 0) > 0 ? 'warning' : 'success'}/>
        <QueueCard icon={Download} label="Contact recap exports" value={(activeRecapExports ?? 0) + (failedRecapExports ?? 0)} detail={`${activeRecapExports ?? 0} active · ${failedRecapExports ?? 0} failed`} href="/admin/contact-recap" tone={(failedRecapExports ?? 0) > 0 ? 'danger' : (activeRecapExports ?? 0) > 0 ? 'warning' : 'success'}/>
      </div>

      {integrity && (
        <section className={`mb-6 rounded-2xl border p-5 ${integrity.status === 'failed' ? 'border-red-500/30 bg-red-500/8' : integrity.status === 'warning' ? 'border-amber-500/30 bg-amber-500/8' : 'border-emerald-500/25 bg-emerald-500/8'}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-400">Canonical data audit</div>
              <h2 className="mt-1 text-lg font-black text-white">Statcast integrity through {integrity.through_date}</h2>
              <p className="mt-1 text-sm text-zinc-300">Every completed game, pitch event, source-to-column mapping, classification flag, and Statcast category is reconciled.</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${integrity.status === 'failed' ? 'bg-red-500/15 text-red-300' : integrity.status === 'warning' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{integrity.status}</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <IntegrityMetric label="Pitch events" value={integrity.checks?.pitch_log?.rows ?? 0} />
            <IntegrityMetric label="Games" value={integrity.checks?.pitch_log?.games ?? 0} />
            <IntegrityMetric label="Fair balls" value={integrity.checks?.pitch_log?.fair_balls ?? 0} />
            <IntegrityMetric label="Home runs" value={integrity.checks?.pitch_log?.home_runs ?? 0} />
            <IntegrityMetric label="Source unavailable" value={sourceUnavailable} />
            <IntegrityMetric label="Pipeline gaps" value={integrity.summary?.failures ?? 0} danger={(integrity.summary?.failures ?? 0) > 0} />
          </div>
          <div className="mt-3 space-y-1 text-xs text-zinc-500">
            <p>Official MLB final-game gaps: {integrity.checks?.official_schedule?.final_games_without_pitch_log ?? 0}. Stored schedule gaps: {integrity.checks?.game_coverage?.scheduled_games_without_pitch_log ?? 0}.</p>
            <p>Source unavailable counts are genuine MLB/Statcast omissions, displayed as unavailable rather than zero. HR event coverage gaps: {integrity.checks?.home_run_enrichment?.missing_detail_events ?? 0}. Canonical detail fallbacks: {integrity.checks?.home_run_enrichment?.canonical_fallback_home_runs ?? 0}. Every MLB home run has a detail record; a fallback preserves the canonical event when Savant has not published its separate park projection.</p>
          </div>
        </section>
      )}

      <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/60">
        <div className="grid grid-cols-[minmax(240px,1fr)_120px_130px_110px_70px] gap-4 border-b border-zinc-800 px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
          <span>Pipeline</span><span>Status</span><span>Last signal</span><span>Next run</span><span>Action</span>
        </div>
        {rows.map(({ pipeline, run, evidence, state }) => {
          const Icon = state === 'succeeded' || state === 'verified' ? CheckCircle2 : state === 'running' || state === 'deferred' ? Clock3 : state === 'waiting' ? Gauge : AlertTriangle
          const tone = state === 'succeeded' ? 'text-emerald-400' : state === 'verified' || state === 'running' ? 'text-cyan-400' : state === 'deferred' ? 'text-amber-300' : state === 'waiting' ? 'text-zinc-500' : state === 'failed' || state === 'timed_out' ? 'text-red-400' : 'text-amber-400'
          const statusLabel = state === 'verified' ? 'Data current' : state === 'waiting' ? 'No telemetry' : state === 'timed_out' ? 'Timed out' : state === 'deferred' ? 'Waiting for Statcast' : state
          const signalAt = state === 'verified' ? evidence?.observedAt : run?.started_at ?? evidence?.observedAt
          const ageMinutes = run?.started_at ? Math.max(1, (Date.now() - new Date(run.started_at).getTime()) / 60_000) : 0
          return (
            <div key={pipeline.name} className="grid grid-cols-[minmax(240px,1fr)_120px_130px_110px_70px] gap-4 border-b border-zinc-800/70 px-5 py-4 text-sm last:border-0">
              <div className="min-w-0"><div className="font-semibold text-white">{pipeline.label}</div><div className="mt-0.5 text-xs text-zinc-500">{pipeline.area} · {pipeline.schedule}</div>{run?.error && <div className={`mt-1 truncate text-xs ${state === 'deferred' ? 'text-amber-200' : 'text-red-300'}`} title={run.error}>{run.error}</div>}{state === 'deferred' && run?.details?.requiredThroughDate && <div className="mt-1 text-[11px] text-zinc-500">Required through {run.details.requiredThroughDate}{run.details.stage ? ` · ${run.details.stage}` : ''}</div>}</div>
              <div className={`flex items-center gap-1.5 ${tone}`} title={state === 'verified' ? `Verified from ${evidence?.detail}` : undefined}><Icon size={14} />{statusLabel}</div>
              <div className="text-zinc-300">{signalAt ? ageLabel(signalAt) : evidence?.currentOutput ? 'Output verified' : 'Not recorded'}</div>
              <div className="text-xs text-zinc-400"><span className="block">{nextRunLabel(pipeline.schedule)}</span><span className="text-zinc-600">{run ? state === 'timed_out' ? `${Math.floor(ageMinutes)}m+` : durationLabel(run.duration_ms, run.status) : 'No duration'}</span></div>
              <PipelineRetryButton jobName={pipeline.name}/>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function IntegrityMetric({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <div className="rounded-xl border border-white/8 bg-black/20 px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</p><p className={`mt-1 text-xl font-black ${danger ? 'text-red-300' : 'text-white'}`}>{value.toLocaleString()}</p></div>
}

function QueueCard({ icon: Icon, label, value, detail, tone, href }: {
  icon: LucideIcon
  label: string
  value: number
  detail: string
  tone: 'success' | 'warning' | 'danger' | 'neutral'
  href?: string
}) {
  const color = tone === 'success' ? 'text-emerald-400' : tone === 'warning' ? 'text-amber-400' : tone === 'danger' ? 'text-red-400' : 'text-zinc-300'
  const content = <><div className="flex items-center justify-between"><p className="text-xs font-bold text-zinc-500">{label}</p><Icon size={16} className={color} /></div><p className={`mt-2 text-2xl font-black ${color}`}>{value}</p><p className="mt-1 text-xs text-zinc-500">{detail}</p></>
  return href ? <Link href={href} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 transition-colors hover:border-zinc-700 hover:bg-zinc-900">{content}</Link> : <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">{content}</div>
}
