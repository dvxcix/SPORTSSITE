import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] border text-[13px] font-extrabold tracking-[-0.01em] shadow-[inset_0_1px_rgba(255,255,255,0.05)] transition-[background-color,border-color,color,box-shadow,transform,filter] duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:pointer-events-none disabled:opacity-45 active:scale-[0.985]',
  {
    variants: {
      variant: {
        default: 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)] shadow-[0_8px_24px_rgba(180,255,77,0.12),inset_0_1px_rgba(255,255,255,0.3)] hover:-translate-y-px hover:brightness-105 hover:shadow-[0_12px_32px_rgba(180,255,77,0.2),inset_0_1px_rgba(255,255,255,0.34)]',
        secondary: 'border-[var(--border-2)] bg-[color-mix(in_srgb,var(--surface-3)_86%,transparent)] text-[var(--text-1)] backdrop-blur-xl hover:-translate-y-px hover:border-[var(--border-3)] hover:bg-[var(--surface-4)]',
        ghost: 'border-transparent bg-transparent text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]',
        destructive: 'border-[var(--status-danger)] bg-[var(--status-danger)] text-white hover:brightness-110',
        outline: 'border-[var(--border-2)] bg-[rgba(255,255,255,0.018)] text-[var(--text-1)] hover:-translate-y-px hover:border-[var(--border-3)] hover:bg-[var(--surface-2)]',
      },
      size: {
        default: 'h-[var(--control-md)] px-4 py-2',
        sm: 'h-[var(--control-sm)] px-3 text-xs',
        lg: 'h-[var(--control-lg)] px-6 text-base',
        icon: 'h-[var(--control-md)] w-[var(--control-md)] p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  )
)
Button.displayName = 'Button'

export { Button, buttonVariants }
