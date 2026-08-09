import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold leading-4',
  {
    variants: {
      variant: {
        default: 'border-[var(--border-2)] bg-[var(--surface-3)] text-[var(--text-2)]',
        live: 'border-green-500/30 bg-[var(--status-success-bg)] text-[var(--status-success)]',
        final: 'border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--text-3)]',
        upcoming: 'border-blue-500/30 bg-[var(--status-info-bg)] text-[var(--status-info)]',
        pick: 'border-yellow-500/30 bg-[var(--status-warning-bg)] text-[var(--status-warning)]',
        popular: 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]',
        save: 'border-lime-400/30 bg-[var(--accent-dim)] text-[var(--accent)]',
        danger: 'border-red-500/30 bg-[var(--status-danger-bg)] text-[var(--status-danger)]',
        info: 'border-blue-500/30 bg-[var(--status-info-bg)] text-[var(--status-info)]',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { badgeVariants }
