'use client'

import { Activity, Gauge, TriangleAlert } from 'lucide-react'

export type RouteQuality = {
  route: string
  events: number
  failures: number
  slow: number
  p95Ms: number
  devices: number
  lastSeen: string | null
}

export function LiveQualityQueue({ rows }: { rows: RouteQuality[] }) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-card)] sm:p-4" aria-labelledby="live-quality-title">
      <header className="flex items-end justify-between gap-3 border-b border-[var(--border)] pb-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[.14em] text-[var(--accent)]">Real traffic</p>
          <h2 id="live-quality-title" className="mt-1 text-base font-black text-[var(--text-1)]">Routes needing attention</h2>
        </div>
        <small className="text-[9px] text-[var(--text-3)]">Failure → slowness → sample size</small>
      </header>
      {rows.length ? (
        <div className="mt-3 grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
          {rows.map(row => (
            <article key={row.route} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <div className="min-w-0">
                <strong className="block truncate font-mono text-[10px] text-[var(--text-1)]">{row.route}</strong>
                <span className="mt-2 flex flex-wrap gap-2 text-[8px] text-[var(--text-3)]">
                  <em className="flex items-center gap-1 not-italic"><Activity size={10}/>{row.events} events</em>
                  <em className="flex items-center gap-1 not-italic"><TriangleAlert size={10}/>{row.failures} failed</em>
                  <em className="flex items-center gap-1 not-italic"><Gauge size={10}/>{row.p95Ms}ms p95</em>
                </span>
              </div>
              <div className="text-right"><b className={row.failures ? 'text-rose-300' : row.slow ? 'text-amber-300' : 'text-emerald-300'}>{row.failures || row.slow || 'OK'}</b><small className="block text-[7px] uppercase text-[var(--text-3)]">{row.failures ? 'failures' : row.slow ? 'slow' : 'status'}</small></div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-[var(--border)] p-5 text-center text-xs text-[var(--text-3)]">No route telemetry has arrived yet.</div>
      )}
    </section>
  )
}
