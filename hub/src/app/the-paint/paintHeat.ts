import type { CSSProperties } from 'react'

// A shared visual scale; this never changes a score, probability or ranking.
export function nbaHeatStyle(value: number | null | undefined, midpoint = 50): CSSProperties | undefined {
  if (value == null || !Number.isFinite(value)) return undefined
  const bounded = Math.max(0, Math.min(100, value))
  const distance = Math.min(1, Math.abs(bounded - midpoint) / (bounded < midpoint ? midpoint : 100 - midpoint))
  const rgb = distance < .12 ? '165 180 199' : bounded < midpoint ? '233 128 145' : '169 223 116'
  return { '--heat-rgb': rgb, '--heat-strength': (.08 + distance * .22).toFixed(3) } as CSSProperties
}
