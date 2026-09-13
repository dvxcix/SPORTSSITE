'use client'

import { Check, ChevronRight, CircleDashed } from 'lucide-react'
import { PRODUCT_ROADMAP_PHASES, roadmapCompletion } from '@/lib/productRoadmap'

export function RoadmapProgress() {
  const complete = PRODUCT_ROADMAP_PHASES.filter(phase => phase.status === 'complete').length
  const active = PRODUCT_ROADMAP_PHASES.find(phase => phase.status === 'active')

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-card)] sm:p-4" aria-labelledby="product-roadmap-title">
      <header className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[.14em] text-[var(--accent)]">Product roadmap</p>
          <h2 id="product-roadmap-title" className="mt-1 text-lg font-black tracking-[-.025em] text-[var(--text-1)]">{complete} of {PRODUCT_ROADMAP_PHASES.length} sections complete</h2>
          <p className="mt-1 text-xs text-[var(--text-3)]">Current focus: {active?.label ?? 'Release monitoring'}</p>
        </div>
        <div className="flex min-w-48 items-center gap-3">
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]"><span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${roadmapCompletion()}%` }}/></span>
          <strong className="font-mono text-sm text-[var(--accent)]">{roadmapCompletion()}%</strong>
        </div>
      </header>
      <div className="mt-3 grid gap-2 lg:grid-cols-2 xl:grid-cols-4">
        {PRODUCT_ROADMAP_PHASES.map(phase => (
          <details key={phase.id} className="group rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3" open={phase.status === 'active'}>
            <summary className="flex cursor-pointer list-none items-center gap-2">
              <span className={phase.status === 'complete' ? 'text-emerald-300' : 'text-amber-300'}>{phase.status === 'complete' ? <Check size={15}/> : <CircleDashed size={15}/>}</span>
              <span className="min-w-0 flex-1"><b className="block truncate text-[11px] text-[var(--text-1)]">{phase.label}</b><small className="text-[8px] font-black uppercase tracking-[.09em] text-[var(--text-3)]">{phase.status} · {phase.progress}%</small></span>
              <ChevronRight size={13} className="text-[var(--text-3)] transition-transform group-open:rotate-90"/>
            </summary>
            <div className="mt-3 border-t border-[var(--border)] pt-3">
              <p className="text-[8px] font-black uppercase tracking-[.1em] text-[var(--text-3)]">Shipped</p>
              <ul className="mt-2 space-y-1.5">{phase.shipped.map(item => <li key={item} className="flex gap-2 text-[9px] leading-4 text-[var(--text-2)]"><Check size={11} className="mt-0.5 shrink-0 text-emerald-300"/>{item}</li>)}</ul>
              {phase.remaining.length > 0 && <><p className="mt-3 text-[8px] font-black uppercase tracking-[.1em] text-amber-300">Remaining</p><ul className="mt-2 space-y-1.5">{phase.remaining.map(item => <li key={item} className="flex gap-2 text-[9px] leading-4 text-[var(--text-2)]"><CircleDashed size={11} className="mt-0.5 shrink-0 text-amber-300"/>{item}</li>)}</ul></>}
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}
