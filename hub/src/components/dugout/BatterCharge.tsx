'use client'

import type { CSSProperties } from 'react'
import type { DugoutMomentumResult } from '@/lib/dugoutMomentum'

const signed = (value: number | null) => value == null ? '—' : (value > 0 ? '+' : '') + value.toFixed(1)

export function BatterCharge({ momentum, className, label = 'Batter Charge' }: {
  momentum: DugoutMomentumResult
  className?: string
  label?: string
}) {
  const detail = momentum.direction === 'unknown'
    ? label + ': not enough L10/L5/L3/L1 data'
    : label + ': ' + momentum.label + ' ' + signed(momentum.score) + ' · SlipSurge ' + signed(momentum.slipsurgeTrend) + ' · Paper ' + signed(momentum.paperTrend)

  return (
    <span
      className={'dg-momentum-battery is-' + momentum.direction + (className ? ' ' + className : '')}
      role="img"
      aria-label={detail}
      title={detail}
      style={{ ['--dg-momentum-level' as string]: Math.round(momentum.level * 100) + '%' } as CSSProperties}
    >
      <span className="dg-momentum-battery-fill" />
      <span className="dg-momentum-battery-cap" />
    </span>
  )
}
