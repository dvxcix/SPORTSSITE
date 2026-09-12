'use client'

import { useMemo, useState } from 'react'
import { Check, CircleDashed, Filter, Search, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { DataGrid, type DataGridColumn } from '@/components/ui/DataGrid'
import { PRODUCT_EXPERIENCE_ROUTES, AUDIT_DIMENSIONS, routeCompletion, type AuditState, type ExperienceRoute } from '@/lib/productExperienceAudit'
import { cn } from '@/lib/utils'

const STATE_META: Record<AuditState, { label: string; icon: typeof Check; className: string }> = {
  complete: { label: 'Shared', icon: Check, className: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' },
  partial: { label: 'Partial', icon: CircleDashed, className: 'border-amber-400/25 bg-amber-400/10 text-amber-300' },
  missing: { label: 'Missing', icon: TriangleAlert, className: 'border-rose-400/25 bg-rose-400/10 text-rose-300' },
}

const PRIORITIES = ['All', 'P0', 'P1', 'P2'] as const

function StateCell({ state }: { state: AuditState }) {
  const meta = STATE_META[state]
  const Icon = meta.icon
  return (
    <span className={cn('inline-flex min-h-7 items-center gap-1.5 rounded-lg border px-2 text-[10px] font-black', meta.className)} title={meta.label}>
      <Icon size={12} aria-hidden="true" /><span className="hidden xl:inline">{meta.label}</span>
    </span>
  )
}

type TelemetrySummary = { events: number; measuredRoutes: number; failures: number; slowInteractions: number; p95ReadyMs: number; deviceCoverage: number }

export function ProductAuditClient({ telemetry }: { telemetry: TelemetrySummary }) {
  const [query, setQuery] = useState('')
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('All')
  const [family, setFamily] = useState('All')
  const families = useMemo(() => ['All', ...new Set(PRODUCT_EXPERIENCE_ROUTES.map(route => route.family))], [])
  const normalized = query.trim().toLowerCase()
  const routes = useMemo(() => PRODUCT_EXPERIENCE_ROUTES.filter(route => {
    if (priority !== 'All' && route.priority !== priority) return false
    if (family !== 'All' && route.family !== family) return false
    return !normalized || [route.route, route.label, route.family].some(value => value.toLowerCase().includes(normalized))
  }), [family, normalized, priority])
  const columns = useMemo<DataGridColumn<ExperienceRoute>[]>(() => [
    {
      id: 'route', header: 'Route', mobileLabel: 'Surface', pinned: true,
      sortValue: route => route.label,
      cell: route => <div className="min-w-0"><p className="text-xs font-black text-[var(--text-1)]">{route.label}</p><p className="mt-0.5 font-mono text-[9px] text-[var(--text-3)]">{route.route} · {route.family}</p></div>,
    },
    {
      id: 'priority', header: 'Priority', sortValue: route => route.priority, align: 'center',
      cell: route => <Badge variant={route.priority === 'P0' ? 'danger' : route.priority === 'P1' ? 'pick' : 'default'}>{route.priority}</Badge>,
    },
    ...AUDIT_DIMENSIONS.map(dimension => ({
      id: dimension, header: dimension, mobileLabel: dimension, sortValue: (route: ExperienceRoute) => route[dimension], align: 'center' as const,
      cell: (route: ExperienceRoute) => <StateCell state={route[dimension]} />,
    })),
    {
      id: 'progress', header: 'Progress', sortValue: routeCompletion, align: 'right',
      cell: route => { const completion = routeCompletion(route); return <div className="ml-auto flex w-28 items-center gap-2"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]"><span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${completion}%` }} /></span><b className="w-8 text-right font-mono text-[10px] text-[var(--text-2)]">{completion}%</b></div> },
    },
  ], [])

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Audit summary">
        <Summary label="Tracked routes" value={PRODUCT_EXPERIENCE_ROUTES.length} />
        <Summary label="P0 surfaces" value={PRODUCT_EXPERIENCE_ROUTES.filter(route => route.priority === 'P0').length} tone="danger" />
        <Summary label="Shared shell" value={PRODUCT_EXPERIENCE_ROUTES.filter(route => route.shell === 'complete').length} tone="success" />
        <Summary label="Missing state systems" value={PRODUCT_EXPERIENCE_ROUTES.filter(route => route.states === 'missing').length} tone="warning" />
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6" aria-label="Recent product measurement sample">
        <Summary label="Measured events" value={telemetry.events} />
        <Summary label="Measured routes" value={telemetry.measuredRoutes} tone="success" />
        <Summary label="Action failures" value={telemetry.failures} tone={telemetry.failures ? 'danger' : 'success'} />
        <Summary label="Slow interactions" value={telemetry.slowInteractions} tone={telemetry.slowInteractions ? 'warning' : 'success'} />
        <Summary label="P95 ready" value={`${telemetry.p95ReadyMs}ms`} tone={telemetry.p95ReadyMs > 2500 ? 'warning' : 'default'} />
        <Summary label="Device classes" value={`${telemetry.deviceCoverage}/5`} />
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-card)] sm:p-4">
        <header className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <label className="relative min-w-0 flex-1">
            <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
            <span className="sr-only">Search routes</span>
            <input className="ss-input h-10 rounded-xl pl-9 text-xs" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search route, page, or family" />
          </label>
          <div className="flex min-w-0 gap-2 overflow-x-auto pb-1 xl:pb-0">
            <label className="relative">
              <span className="sr-only">Filter by family</span>
              <Filter size={13} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
              <select value={family} onChange={event => setFamily(event.target.value)} className="h-10 min-w-48 appearance-none rounded-xl border border-[var(--border-2)] bg-[var(--surface-2)] pl-8 pr-8 text-xs font-bold text-[var(--text-2)]">
                {families.map(value => <option key={value}>{value}</option>)}
              </select>
            </label>
            <div className="flex rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-1">
              {PRIORITIES.map(value => (
                <button key={value} type="button" onClick={() => setPriority(value)} aria-pressed={priority === value} className={cn('min-h-8 rounded-lg px-3 text-[10px] font-black transition', priority === value ? 'bg-[var(--accent)] text-[var(--accent-fg)]' : 'text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]')}>{value}</button>
              ))}
            </div>
          </div>
        </header>
      </section>
      <DataGrid ariaLabel="Product experience route audit" rows={routes} columns={columns} getRowKey={route => route.route} storageKey="admin-product-audit" empty={<div><Search size={20} className="mx-auto text-[var(--text-3)]" /><p className="mt-2 text-sm font-black text-[var(--text-1)]">No matching routes</p><p className="mt-1 text-xs text-[var(--text-3)]">Change a filter or search term.</p></div>} />
    </div>
  )
}

function Summary({ label, value, tone = 'default' }: { label: string; value: number | string; tone?: 'default' | 'success' | 'warning' | 'danger' }) {
  const colors = {
    default: 'text-[var(--text-1)]',
    success: 'text-emerald-300',
    warning: 'text-amber-300',
    danger: 'text-rose-300',
  }
  return <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"><p className="text-[9px] font-black uppercase tracking-[.14em] text-[var(--text-3)]">{label}</p><strong className={cn('mt-2 block text-2xl font-black tabular-nums', colors[tone])}>{value}</strong></article>
}
