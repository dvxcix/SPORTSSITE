import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex min-h-[22px] items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px] font-extrabold leading-4 tracking-[0.01em] shadow-[inset_0_1px_rgba(255,255,255,0.035)] backdrop-blur-lg',
  {
    variants: {
      variant: {
        default: 'border-[var(--border-2)] bg-[var(--surface-3)] text-[var(--text-2)]',
        live: 'border-[color-mix(in_srgb,var(--green)_30%,transparent)] bg-[var(--status-success-bg)] text-[var(--status-success)]',
        final: 'border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--text-3)]',
        upcoming: 'border-[color-mix(in_srgb,var(--blue)_30%,transparent)] bg-[var(--status-info-bg)] text-[var(--status-info)]',
        pick: 'border-yellow-500/30 bg-[var(--status-warning-bg)] text-[var(--status-warning)]',
        popular: 'border-[var(--accent)] bg-[var(--accent-fill)] text-[var(--accent-fg)]',
        save: 'border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[var(--accent-dim)] text-[var(--accent)]',
        danger: 'border-[color-mix(in_srgb,var(--red)_30%,transparent)] bg-[var(--status-danger-bg)] text-[var(--status-danger)]',
        info: 'border-[color-mix(in_srgb,var(--blue)_30%,transparent)] bg-[var(--status-info-bg)] text-[var(--status-info)]',
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
