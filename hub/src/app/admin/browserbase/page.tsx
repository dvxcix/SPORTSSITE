import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Cloud,
  DatabaseZap,
  Gauge,
  HardDriveDownload,
  Radio,
  ServerCog,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminStatCard } from '@/components/admin/AdminStatCard'
import { browserbasePlanUsage, getBrowserbaseUsageSummary } from '@/lib/browserbaseUsage'

export const dynamic = 'force-dynamic'

const panel = 'overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-[var(--shadow-card)]'

export default async function BrowserbaseOperationsPage() {
  const usage = await getBrowserbaseUsageSummary().catch(() => null)

  if (!usage) {
    return (
      <div className="mx-auto w-full max-w-[1480px] space-y-6 px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <AdminPageHeader title="Browser automation" description="Browserbase cost, sessions, workflows, and extraction health." icon={Cloud} />
        <div className="rounded-3xl border border-red-500/25 bg-red-500/10 p-6 text-sm text-red-200">
          Browserbase usage could not be loaded. Confirm the production API key and project ID, then inspect runtime logs.
        </div>
      </div>
    )
  }

  const plan = browserbasePlanUsage(usage)
  const browserBudgetMinutes = Number(process.env.BROWSERBASE_BROWSER_MINUTE_BUDGET) || 25_500
  const proxyBudgetBytes = Number(process.env.BROWSERBASE_PROXY_BYTE_BUDGET) || 4_250_000_000
  const proxyBlocked = usage.proxyBytes >= proxyBudgetBytes
  const browserBlocked = usage.browserMinutes >= browserBudgetMinutes
  const safetyBlocked = proxyBlocked || browserBlocked
  const maxDailyBytes = Math.max(1, ...usage.byDay.map(day => day.proxyBytes))
  const attributedPct = usage.proxyBytes > 0 ? usage.attributedProxyBytes / usage.proxyBytes * 100 : 100
  const totalFailures = (usage.byStatus.ERROR ?? 0) + (usage.byStatus.TIMED_OUT ?? 0)

  return (
    <div className="mx-auto w-full max-w-[1560px] space-y-6 px-3 py-4 sm:px-6 sm:py-6 lg:space-y-8 lg:px-8 lg:py-8">
      <AdminPageHeader
        eyebrow="Infrastructure cost center"
        title="Browser automation"
        description="A complete view of proxy transfer, browser time, scraper attribution, retained sessions, failures, and current safety limits."
        icon={Cloud}
        actions={(
          <Link href="/admin/pipeline-health" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--border-2)] bg-[var(--surface-2)] px-3 text-xs font-extrabold text-[var(--text-2)] transition hover:text-[var(--accent)]">
            <ArrowLeft size={14} aria-hidden="true" /> Pipeline health
          </Link>
        )}
      />

      <section className={`relative overflow-hidden rounded-3xl border p-4 sm:p-5 ${safetyBlocked ? 'border-red-500/35 bg-red-500/10' : 'border-emerald-500/25 bg-emerald-500/8'}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${safetyBlocked ? 'bg-red-500/15 text-red-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
              {safetyBlocked ? <ShieldAlert size={20} aria-hidden="true" /> : <CheckCircle2 size={20} aria-hidden="true" />}
            </span>
            <div>
              <p className={`text-[10px] font-black uppercase tracking-[0.18em] ${safetyBlocked ? 'text-red-300' : 'text-emerald-300'}`}>Automated spending guard</p>
              <h2 className="mt-1 text-lg font-black text-[var(--text-1)]">{safetyBlocked ? 'New automated sessions are blocked' : 'Automation is inside its safety budget'}</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--text-2)]">
                {proxyBlocked ? 'Proxy transfer crossed the configured stop line. ' : ''}
                {browserBlocked ? 'Browser time crossed the configured stop line. ' : ''}
                Manual authentication remains separate; extraction should fail closed before creating more paid usage.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:min-w-[390px]">
            <GuardRail label="Proxy stop line" value={`${formatGb(proxyBudgetBytes)} GB`} used={`${plan.proxyGigabytes.toFixed(2)} GB used`} tripped={proxyBlocked} />
            <GuardRail label="Browser stop line" value={`${(browserBudgetMinutes / 60).toFixed(0)} hours`} used={`${plan.browserHours.toFixed(1)} h used`} tripped={browserBlocked} />
          </div>
        </div>
      </section>

      <section aria-label="Browserbase cost overview" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <AdminStatCard label="Proxy transfer" value={`${plan.proxyGigabytes.toFixed(2)} GB`} icon={HardDriveDownload} tone="danger" detail={`${plan.proxyPercent.toFixed(0)}% of 5 GB included`} />
        <AdminStatCard label="Proxy overage" value={usd(plan.proxyOverageUsd)} icon={CircleDollarSign} tone={plan.proxyOverageUsd > 0 ? 'danger' : 'success'} detail={`${plan.proxyOverageGigabytes.toFixed(2)} GB billed at $10/GB`} />
        <AdminStatCard label="Current estimated bill" value={usd(plan.estimatedCurrentBillUsd)} icon={Gauge} tone={plan.estimatedCurrentBillUsd > 150 ? 'danger' : 'warning'} detail="Plan plus measured overages" />
        <AdminStatCard label="Pace forecast" value={usd(plan.projectedBillUsd)} icon={Activity} tone={plan.projectedBillUsd > 150 ? 'danger' : 'warning'} detail={`${plan.projectedProxyGigabytes.toFixed(1)} GB if this pace continues`} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,.55fr)]">
        <div className={panel}>
          <PanelHeader eyebrow="Current billing cycle" title="Daily proxy burn" detail={`${plan.averageProxyGigabytesPerCalendarDay.toFixed(2)} GB/day actual · ${plan.includedProxyGigabytesPerCalendarDay.toFixed(2)} GB/day sustainable`} />
          <div className="space-y-3 p-4 sm:p-5">
            {usage.byDay.length > 0 ? usage.byDay.map(day => {
              const width = Math.max(1, day.proxyBytes / maxDailyBytes * 100)
              return (
                <div key={day.date} className="grid grid-cols-[76px_minmax(0,1fr)_80px] items-center gap-3 text-xs">
                  <time className="font-bold tabular-nums text-[var(--text-2)]">{shortDate(day.date)}</time>
                  <div className="h-7 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-overlay)]" title={`${day.sessions} sessions · ${day.errors} failed`}>
                    <div className={`flex h-full min-w-1 items-center rounded-lg px-2 ${day.errors > 0 ? 'bg-gradient-to-r from-amber-500/55 to-red-500/55' : 'bg-gradient-to-r from-cyan-500/45 to-[var(--accent)]/65'}`} style={{ width: `${width}%` }}>
                      <span className="truncate text-[9px] font-black text-white/85">{day.sessions} runs</span>
                    </div>
                  </div>
                  <span className="text-right font-black tabular-nums text-[var(--text-1)]">{formatGb(day.proxyBytes)} GB</span>
                </div>
              )
            }) : <Empty label="No retained sessions in this cycle." />}
          </div>
        </div>

        <div className={`${panel} p-4 sm:p-5`}>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--accent)]">Billing reconciliation</p>
          <h2 className="mt-1 text-base font-black text-[var(--text-1)]">Can every byte be explained?</h2>
          <div className="mt-5 space-y-4">
            <ReconcileRow label="Provider-reported proxy" value={`${plan.proxyGigabytes.toFixed(3)} GB`} icon={Cloud} />
            <ReconcileRow label="Retained sessions attributed" value={`${formatGb(usage.attributedProxyBytes)} GB`} icon={DatabaseZap} />
            <ReconcileRow label="Not represented by retained sessions" value={`${formatGb(usage.unaccountedProxyBytes)} GB`} icon={AlertTriangle} danger={usage.unaccountedProxyBytes > 50_000_000} />
            <ReconcileRow label="Untagged sessions" value={usage.untaggedSessions.toLocaleString()} icon={ShieldAlert} danger={usage.untaggedSessions > 0} />
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-[var(--surface-overlay)]">
            <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, attributedPct)}%` }} />
          </div>
          <p className="mt-2 text-xs text-[var(--text-3)]">{Math.min(100, attributedPct).toFixed(1)}% of provider usage reconciled to sessions retained in this billing cycle.</p>
        </div>
      </section>

      <section className={panel}>
        <PanelHeader eyebrow="Cost attribution" title="Usage by extractor" detail="Sorted by paid proxy transfer. A high cost per run exposes the most expensive workflow even when it runs less often." />
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[minmax(210px,1.5fr)_100px_110px_110px_110px_100px_110px] gap-3 border-b border-[var(--border)] px-5 py-3 text-[9px] font-black uppercase tracking-[0.12em] text-[var(--text-3)]">
              <span>Extractor</span><span>Sessions</span><span>Proxy</span><span>Per run</span><span>Browser</span><span>Failures</span><span>Allocated overage</span>
            </div>
            <div className="divide-y divide-[var(--border-subtle)]">
              {usage.byWorkflow.map(workflow => {
                const failed = workflow.errors + workflow.timedOut
                const cost = usage.attributedProxyBytes > 0 ? plan.proxyOverageUsd * workflow.proxyBytes / usage.attributedProxyBytes : 0
                return (
                  <div key={workflow.name} className="grid grid-cols-[minmax(210px,1.5fr)_100px_110px_110px_110px_100px_110px] items-center gap-3 px-5 py-3 text-xs text-[var(--text-2)]">
                    <div className="min-w-0"><p className="truncate font-mono font-bold text-[var(--text-1)]">{workflow.name}</p><p className="mt-0.5 text-[9px] text-[var(--text-3)]">Last seen {dateTime(workflow.lastSeenAt)}</p></div>
                    <span className="tabular-nums">{workflow.sessions.toLocaleString()}</span>
                    <span className="font-black tabular-nums text-[var(--text-1)]">{formatGb(workflow.proxyBytes)} GB</span>
                    <span className="tabular-nums">{formatMb(workflow.proxyBytes / Math.max(1, workflow.sessions))} MB</span>
                    <span className="tabular-nums">{(workflow.browserMinutes / 60).toFixed(2)} h</span>
                    <span className={`font-bold tabular-nums ${failed > 0 ? 'text-amber-300' : 'text-emerald-400'}`}>{failed}</span>
                    <span className="font-black tabular-nums text-red-300">{usd(cost)}</span>
                  </div>
                )
              })}
              {usage.byWorkflow.length === 0 ? <Empty label="No workflow metadata is available." /> : null}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <MiniPanel icon={Clock3} title="Browser time" value={`${plan.browserHours.toFixed(1)} / 500 h`} detail={`${plan.browserOverageHours.toFixed(1)} overage hours · ${usd(plan.browserOverageUsd)} overage`} />
        <MiniPanel icon={Radio} title="Session state" value={`${usage.runningSessions} running`} detail={`${usage.cycleSessionCount.toLocaleString()} this cycle · ${totalFailures.toLocaleString()} failed or timed out`} danger={usage.runningSessions > 0 || totalFailures > 0} />
        <MiniPanel icon={ServerCog} title="Retention window" value={`${usage.retainedSessionCount.toLocaleString()} sessions`} detail={`Latest 100 shown · refreshed ${dateTime(usage.generatedAt)}`} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className={`${panel} p-4 sm:p-5`}>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--accent)]">Outcome distribution</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(usage.byStatus).toSorted(([left], [right]) => left.localeCompare(right)).map(([status, count]) => (
              <div key={status} className="min-w-28 rounded-xl border border-[var(--border)] bg-[var(--surface-overlay)] px-3 py-2">
                <p className="text-[9px] font-black uppercase tracking-wider text-[var(--text-3)]">{status.replaceAll('_', ' ')}</p>
                <p className="mt-1 text-lg font-black tabular-nums text-[var(--text-1)]">{count.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
        <div className={`${panel} p-4 sm:p-5`}>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--accent)]">Region distribution</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(usage.byRegion).toSorted(([left], [right]) => left.localeCompare(right)).map(([region, count]) => (
              <div key={region} className="min-w-32 rounded-xl border border-[var(--border)] bg-[var(--surface-overlay)] px-3 py-2">
                <p className="text-[9px] font-black uppercase tracking-wider text-[var(--text-3)]">{region}</p>
                <p className="mt-1 text-lg font-black tabular-nums text-[var(--text-1)]">{count.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={panel}>
        <PanelHeader eyebrow="Forensics" title="Recent sessions" detail="Use workflow, status, bytes, duration, region, and keep-alive state to identify runaway or unusually expensive runs." />
        <div className="overflow-x-auto">
          <div className="min-w-[1040px]">
            <div className="grid grid-cols-[90px_minmax(220px,1fr)_110px_160px_100px_100px_100px_90px] gap-3 border-b border-[var(--border)] px-5 py-3 text-[9px] font-black uppercase tracking-[0.12em] text-[var(--text-3)]">
              <span>Session</span><span>Workflow</span><span>Status</span><span>Started</span><span>Duration</span><span>Proxy</span><span>Region</span><span>Keep alive</span>
            </div>
            <div className="divide-y divide-[var(--border-subtle)]">
              {usage.recentSessions.map(session => (
                <div key={`${session.idSuffix}-${session.createdAt}`} className="grid grid-cols-[90px_minmax(220px,1fr)_110px_160px_100px_100px_100px_90px] items-center gap-3 px-5 py-3 text-xs text-[var(--text-2)]">
                  <span className="font-mono text-[var(--text-3)]">…{session.idSuffix}</span>
                  <span className="truncate font-mono font-bold text-[var(--text-1)]" title={session.workflow}>{session.workflow}</span>
                  <StatusBadge status={session.status} />
                  <time className="tabular-nums">{dateTime(session.createdAt)}</time>
                  <span className="tabular-nums">{session.browserMinutes.toFixed(1)} min</span>
                  <span className="font-bold tabular-nums">{formatMb(session.proxyBytes)} MB</span>
                  <span>{session.region}</span>
                  <span className={session.keepAlive ? 'font-black text-amber-300' : 'text-[var(--text-3)]'}>{session.keepAlive ? 'Yes' : 'No'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function PanelHeader({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return <div className="border-b border-[var(--border-subtle)] px-4 py-4 sm:px-5"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--accent)]">{eyebrow}</p><h2 className="mt-1 text-base font-black text-[var(--text-1)]">{title}</h2><p className="mt-1 text-xs leading-5 text-[var(--text-3)]">{detail}</p></div>
}

function GuardRail({ label, value, used, tripped }: { label: string; value: string; used: string; tripped: boolean }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-[var(--text-3)]">{label}</p><p className="mt-1 font-black text-[var(--text-1)]">{value}</p><p className={tripped ? 'mt-1 text-[10px] font-bold text-red-300' : 'mt-1 text-[10px] text-[var(--text-3)]'}>{used}</p></div>
}

function ReconcileRow({ label, value, icon: Icon, danger = false }: { label: string; value: string; icon: LucideIcon; danger?: boolean }) {
  return <div className="flex items-center gap-3"><span className={`grid size-9 shrink-0 place-items-center rounded-xl ${danger ? 'bg-red-500/10 text-red-300' : 'bg-[var(--surface-overlay)] text-[var(--accent)]'}`}><Icon size={15} aria-hidden="true" /></span><div className="min-w-0 flex-1"><p className="text-xs text-[var(--text-3)]">{label}</p><p className={`mt-0.5 font-black tabular-nums ${danger ? 'text-red-300' : 'text-[var(--text-1)]'}`}>{value}</p></div></div>
}

function MiniPanel({ icon: Icon, title, value, detail, danger = false }: { icon: LucideIcon; title: string; value: string; detail: string; danger?: boolean }) {
  return <div className={`${panel} flex items-center gap-3 p-4 sm:p-5`}><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${danger ? 'bg-amber-400/10 text-amber-300' : 'bg-[var(--accent-dim)] text-[var(--accent)]'}`}><Icon size={17} aria-hidden="true" /></span><div><p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-3)]">{title}</p><p className="mt-1 text-lg font-black text-[var(--text-1)]">{value}</p><p className="mt-1 text-xs text-[var(--text-3)]">{detail}</p></div></div>
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === 'COMPLETED' ? 'bg-emerald-400/10 text-emerald-300' : status === 'RUNNING' ? 'bg-cyan-400/10 text-cyan-300' : status === 'PENDING' ? 'bg-amber-400/10 text-amber-300' : 'bg-red-400/10 text-red-300'
  return <span className={`w-fit rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wider ${tone}`}>{status}</span>
}

function Empty({ label }: { label: string }) {
  return <p className="px-5 py-10 text-center text-sm text-[var(--text-3)]">{label}</p>
}

function formatGb(bytes: number) { return (bytes / 1_000_000_000).toFixed(3) }
function formatMb(bytes: number) { return (bytes / 1_000_000).toFixed(1) }
function usd(value: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value) }
function shortDate(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) }
function dateTime(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' }).format(new Date(value)) }
