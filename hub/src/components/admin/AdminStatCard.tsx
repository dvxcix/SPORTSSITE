import type { LucideIcon } from 'lucide-react'

type AdminStatCardProps = {
  label: string
  value: number | string
  icon: LucideIcon
  tone?: 'info' | 'success' | 'warning' | 'danger'
  detail?: string
}

export function AdminStatCard({ label, value, icon: Icon, tone = 'info', detail }: AdminStatCardProps) {
  const color = `var(--status-${tone})`
  const background = `var(--status-${tone}-muted)`

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-card)] transition duration-[var(--motion-fast)] hover:-translate-y-0.5 hover:border-[var(--border-strong)] sm:p-5">
      <div className="absolute inset-x-0 top-0 h-px opacity-70" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</p>
          <p className="mt-3 text-3xl font-black tabular-nums tracking-tight text-[var(--text-primary)]">{typeof value === 'number' ? value.toLocaleString() : value}</p>
          {detail && <p className="mt-1 text-xs text-[var(--text-secondary)]">{detail}</p>}
        </div>
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background, color }}>
          <Icon size={18} aria-hidden="true" />
        </div>
      </div>
    </article>
  )
}
