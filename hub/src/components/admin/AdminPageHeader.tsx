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
    <header className="flex flex-col gap-4 rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
      <div className="relative flex min-w-0 items-start gap-3.5">
        {Icon && (
          <div className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)]">
            <Icon size={18} aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <p className="mb-1 text-xs font-medium text-[var(--text-2)]">{eyebrow}</p>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)] sm:text-[32px] sm:leading-tight">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
        </div>
      </div>
      {actions && <div className="relative flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{actions}</div>}
    </header>
  )
}
