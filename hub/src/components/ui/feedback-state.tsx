import type { LucideIcon } from 'lucide-react'
import { AlertCircle, Inbox, LoaderCircle, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type FeedbackTone = 'loading' | 'empty' | 'error' | 'offline'

const DEFAULT_ICON: Record<FeedbackTone, LucideIcon> = {
  loading: LoaderCircle,
  empty: Inbox,
  error: AlertCircle,
  offline: WifiOff,
}

export function FeedbackState({ tone, title, description, actionLabel, onAction, icon: Icon = DEFAULT_ICON[tone], compact = false, className }: {
  tone: FeedbackTone
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  icon?: LucideIcon
  compact?: boolean
  className?: string
}) {
  const isLoading = tone === 'loading'
  return (
    <section aria-live={tone === 'error' || tone === 'offline' ? 'assertive' : 'polite'} aria-busy={isLoading} className={cn('flex flex-col items-center justify-center rounded-[var(--radius)] border border-dashed border-[var(--border-2)] bg-[var(--surface)] text-center', compact ? 'min-h-32 p-4' : 'min-h-56 p-8', className)}>
      <span className="mb-3 grid h-10 w-10 place-items-center rounded-xl border border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--text-2)]">
        <Icon className={cn('h-5 w-5', isLoading && 'animate-spin text-[var(--accent)]')} aria-hidden="true" />
      </span>
      <h3 className="text-sm font-extrabold text-[var(--text-1)]">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-xs leading-5 text-[var(--text-3)]">{description}</p> : null}
      {actionLabel && onAction ? <Button className="mt-4" size="sm" variant="outline" onClick={onAction}>{actionLabel}</Button> : null}
    </section>
  )
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('skeleton block h-4 w-full', className)} />
}
