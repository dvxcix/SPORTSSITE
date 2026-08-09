import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type AdminPageHeaderProps = {
  title: string
  description: string
  eyebrow?: string
  icon?: LucideIcon
  actions?: ReactNode
}

export function AdminPageHeader({ title, description, eyebrow = 'Admin workspace', icon: Icon, actions }: AdminPageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border-accent)] bg-[var(--accent-muted)] text-[var(--accent-primary)] shadow-[var(--shadow-glow)]">
            <Icon size={18} aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">{eyebrow}</p>
          <h1 className="text-2xl font-black tracking-tight text-[var(--text-primary)] sm:text-3xl">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
