import { Activity, AlertTriangle, CheckCircle2, Clock3, Gauge, XCircle } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { TRACKED_PIPELINES } from '@/lib/pipelineRegistry'

export const dynamic = 'force-dynamic'

type Run = {
  id: number
  job_name: string
  status: 'running' | 'succeeded' | 'failed'
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  http_status: number | null
  error: string | null
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

function durationLabel(ms: number | null) {
  if (ms == null) return 'Running'
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
}

export default async function PipelineHealthPage() {
  const admin = createAdminClient()
  const { data, error } = await admin.from('pipeline_runs')
    .select('id,job_name,status,started_at,finished_at,duration_ms,http_status,error')
    .order('started_at', { ascending: false }).limit(250)
  const runs = (data ?? []) as Run[]
  const latest = new Map<string, Run>()
  for (const run of runs) if (!latest.has(run.job_name)) latest.set(run.job_name, run)

  const rows = TRACKED_PIPELINES.map(pipeline => {
    const run = latest.get(pipeline.name)
    const ageMinutes = run ? (currentTimestamp() - new Date(run.started_at).getTime()) / 60_000 : Infinity
    const state = !run ? 'waiting' : run.status === 'failed' ? 'failed' : ageMinutes > pipeline.staleAfterMinutes ? 'stale' : run.status
    return { pipeline, run, state }
  })
  const healthy = rows.filter(row => row.state === 'succeeded').length
  const problems = rows.filter(row => row.state === 'failed' || row.state === 'stale').length

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-cyan-400"><Activity size={14} /> Operations</div>
          <h1 className="text-2xl font-black text-white">Pipeline health</h1>
          <p className="mt-1 text-sm text-zinc-400">Live execution status for production-critical data, alerts and billing jobs.</p>
        </div>
        <p className="text-xs text-zinc-500">Refreshes with the page</p>
      </div>

      {error && <div className="mb-5 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><XCircle size={16} /> Health data could not be loaded.</div>}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4"><p className="text-xs text-zinc-500">Healthy</p><p className="mt-1 text-2xl font-black text-emerald-400">{healthy}</p></div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4"><p className="text-xs text-zinc-500">Needs attention</p><p className="mt-1 text-2xl font-black text-amber-400">{problems}</p></div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4"><p className="text-xs text-zinc-500">Instrumented</p><p className="mt-1 text-2xl font-black text-white">{TRACKED_PIPELINES.length}</p></div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
        <div className="grid grid-cols-[minmax(220px,1fr)_120px_130px_100px] gap-4 border-b border-zinc-800 px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
          <span>Pipeline</span><span>Status</span><span>Last run</span><span>Duration</span>
        </div>
        {rows.map(({ pipeline, run, state }) => {
          const Icon = state === 'succeeded' ? CheckCircle2 : state === 'running' ? Clock3 : state === 'waiting' ? Gauge : AlertTriangle
          const tone = state === 'succeeded' ? 'text-emerald-400' : state === 'running' ? 'text-cyan-400' : state === 'waiting' ? 'text-zinc-500' : state === 'failed' ? 'text-red-400' : 'text-amber-400'
          return (
            <div key={pipeline.name} className="grid grid-cols-[minmax(220px,1fr)_120px_130px_100px] gap-4 border-b border-zinc-800/70 px-5 py-4 text-sm last:border-0">
              <div className="min-w-0"><div className="font-semibold text-white">{pipeline.label}</div><div className="mt-0.5 text-xs text-zinc-500">{pipeline.area} · {pipeline.schedule}</div>{run?.error && <div className="mt-1 truncate text-xs text-red-300" title={run.error}>{run.error}</div>}</div>
              <div className={`flex items-center gap-1.5 capitalize ${tone}`}><Icon size={14} />{state}</div>
              <div className="text-zinc-300">{run ? ageLabel(run.started_at) : 'Awaiting run'}</div>
              <div className="text-zinc-400">{durationLabel(run?.duration_ms ?? null)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
