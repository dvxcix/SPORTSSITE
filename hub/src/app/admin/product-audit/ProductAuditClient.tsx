'use client'

import { useMemo, useState } from 'react'
import { Check, CircleDashed, Filter, Search, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PRODUCT_EXPERIENCE_ROUTES, AUDIT_DIMENSIONS, routeCompletion, type AuditState } from '@/lib/productExperienceAudit'
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

export function ProductAuditClient() {
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

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Audit summary">
        <Summary label="Tracked routes" value={PRODUCT_EXPERIENCE_ROUTES.length} />
        <Summary label="P0 surfaces" value={PRODUCT_EXPERIENCE_ROUTES.filter(route => route.priority === 'P0').length} tone="danger" />
        <Summary label="Shared shell" value={PRODUCT_EXPERIENCE_ROUTES.filter(route => route.shell === 'complete').length} tone="success" />
        <Summary label="Missing state systems" value={PRODUCT_EXPERIENCE_ROUTES.filter(route => route.states === 'missing').length} tone="warning" />
      </section>

      <section className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)]">
        <header className="flex flex-col gap-3 border-b border-[var(--border)] p-3 sm:p-4 xl:flex-row xl:items-center">
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

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-[color-mix(in_srgb,var(--surface-2)_96%,transparent)] backdrop-blur-xl">
              <tr className="border-b border-[var(--border)]">
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[.12em] text-[var(--text-3)]">Route</th>
                <th className="px-3 py-3 text-[10px] font-black uppercase tracking-[.12em] text-[var(--text-3)]">Priority</th>
                {AUDIT_DIMENSIONS.map(dimension => <th key={dimension} className="px-3 py-3 text-[10px] font-black uppercase tracking-[.12em] text-[var(--text-3)]">{dimension}</th>)}
                <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-[.12em] text-[var(--text-3)]">Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline)]">
              {routes.map(route => {
                const completion = routeCompletion(route)
                return (
                  <tr key={route.route} className="group transition-colors hover:bg-[var(--surface-2)]">
                    <td className="px-4 py-3">
                      <div className="min-w-0"><p className="text-xs font-black text-[var(--text-1)]">{route.label}</p><p className="mt-0.5 font-mono text-[9px] text-[var(--text-3)]">{route.route} · {route.family}</p></div>
                    </td>
                    <td className="px-3 py-3"><Badge variant={route.priority === 'P0' ? 'danger' : route.priority === 'P1' ? 'pick' : 'default'}>{route.priority}</Badge></td>
                    {AUDIT_DIMENSIONS.map(dimension => <td key={dimension} className="px-3 py-3"><StateCell state={route[dimension]} /></td>)}
                    <td className="px-4 py-3">
                      <div className="ml-auto flex w-28 items-center gap-2"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]"><span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${completion}%` }} /></span><b className="w-8 text-right font-mono text-[10px] text-[var(--text-2)]">{completion}%</b></div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {routes.length === 0 ? <div className="grid min-h-44 place-items-center text-center"><div><Search size={20} className="mx-auto text-[var(--text-3)]" /><p className="mt-2 text-sm font-black text-[var(--text-1)]">No matching routes</p><p className="mt-1 text-xs text-[var(--text-3)]">Change a filter or search term.</p></div></div> : null}
        </div>
      </section>
    </div>
  )
}

function Summary({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'success' | 'warning' | 'danger' }) {
  const colors = {
    default: 'text-[var(--text-1)]',
    success: 'text-emerald-300',
    warning: 'text-amber-300',
    danger: 'text-rose-300',
  }
  return <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"><p className="text-[9px] font-black uppercase tracking-[.14em] text-[var(--text-3)]">{label}</p><strong className={cn('mt-2 block text-2xl font-black tabular-nums', colors[tone])}>{value}</strong></article>
}
