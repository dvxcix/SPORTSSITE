import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type AdminPageHeaderProps = {
  title: string
  description: string
  eyebrow?: string
  icon?: LucideIcon
  actions?: ReactNode
}

export function AdminPageHeader({ title, description, eyebrow, icon: Icon, actions }: AdminPageHeaderProps) {
  return (
    <header className="ss-admin-page-header flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="relative flex min-w-0 items-start gap-3.5">
        {Icon && (
          <div className="ss-admin-page-icon mt-1 text-[var(--text-2)]">
            <Icon size={18} aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="mb-1 text-xs font-medium text-[var(--text-2)]">{eyebrow}</p>}
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)] sm:text-[32px] sm:leading-tight">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
        </div>
      </div>
      {actions && <div className="relative flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{actions}</div>}
    </header>
  )
}
