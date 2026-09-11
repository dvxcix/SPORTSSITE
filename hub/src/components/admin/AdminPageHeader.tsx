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
    <header className="relative overflow-hidden rounded-[22px] border border-[var(--hairline)] bg-[linear-gradient(145deg,rgba(255,255,255,0.035),transparent_42%),var(--glass)] p-5 shadow-[var(--shadow-card)] backdrop-blur-2xl sm:flex-row sm:items-end sm:justify-between sm:p-6 flex flex-col gap-4">
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-[var(--accent)] opacity-[0.045] blur-3xl" />
      <div className="relative flex min-w-0 items-start gap-3.5">
        {Icon && (
          <div className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-[14px] border border-[var(--border-accent)] bg-[var(--accent-muted)] text-[var(--accent-primary)] shadow-[inset_0_1px_rgba(255,255,255,0.08),var(--shadow-glow)]">
            <Icon size={18} aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">{eyebrow}</p>
          <h1 className="text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)] sm:text-[32px] sm:leading-none">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
        </div>
      </div>
      {actions && <div className="relative flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{actions}</div>}
    </header>
  )
}
