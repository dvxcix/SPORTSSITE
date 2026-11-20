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
    <article className="ss-admin-stat-card relative min-w-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[var(--text-2)]">{label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-[var(--text-primary)] sm:mt-3 sm:text-3xl">{typeof value === 'number' ? value.toLocaleString() : value}</p>
          {detail && <p className="mt-1 text-xs text-[var(--text-secondary)]">{detail}</p>}
        </div>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-10" style={{ background, color }}>
          <Icon size={18} aria-hidden="true" />
        </div>
      </div>
    </article>
  )
}
