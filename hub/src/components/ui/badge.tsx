import * as React from 'react'
import { cn } from '@/lib/utils'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'live' | 'final' | 'upcoming' | 'pick' | 'popular' | 'save'
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
        variant === 'live' && 'bg-green-500/20 text-green-400 animate-pulse',
        variant === 'final' && 'bg-zinc-700 text-zinc-400',
        variant === 'upcoming' && 'bg-blue-500/20 text-blue-400',
        variant === 'pick' && 'bg-yellow-500/20 text-yellow-400',
        variant === 'default' && 'bg-zinc-800 text-zinc-300',
        // Exact brand lime, matching Spotlight/Meteors/BackgroundBeams/Highlight's
        // hardcoded #B4FF4D rather than a generic Tailwind green.
        variant === 'popular' && 'bg-[#B4FF4D] text-black',
        variant === 'save' && 'bg-[#B4FF4D]/15 text-[#B4FF4D]',
        className
      )}
      {...props}
    />
  )
}
