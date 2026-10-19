import type { CSSProperties } from 'react'

export type NbaHeatTone = 'performance' | 'volume'
type HeatValue = number | null | undefined
const finite = (value: HeatValue): value is number => value != null && Number.isFinite(value)
const clamp = (value: number) => Math.max(0, Math.min(100, value))
function heatDomain(pool: readonly HeatValue[]) {
  const known = pool.filter(finite)
  if (known.length < 2) return null
  const low = Math.min(...known), high = Math.max(...known)
  return low === high ? null : { low, high }
}

// Callers pass the complete comparable column before search/visibility filters.
export function nbaRelativeHeat(value: HeatValue, pool: readonly HeatValue[], { invert = false }: { invert?: boolean } = {}): number | null {
  const domain = heatDomain(pool)
  if (!finite(value) || !domain) return null
  const heat = clamp((value - domain.low) / (domain.high - domain.low) * 100)
  return invert ? 100 - heat : heat
}

// Signed differences keep zero neutral even when the whole pool is positive.
export function nbaCenteredHeat(value: HeatValue, pool: readonly HeatValue[], { invert = false }: { invert?: boolean } = {}): number | null {
  const domain = heatDomain(pool)
  if (!finite(value) || !domain) return null
  const radius = Math.max(Math.abs(domain.low), Math.abs(domain.high))
  const heat = clamp(50 + value / radius * 50)
  return invert ? 100 - heat : heat
}

// A shared visual scale; this never changes a score, probability or ranking.
export function nbaHeatStyle(value: HeatValue, midpoint = 50, tone: NbaHeatTone = 'performance'): CSSProperties | undefined {
  if (!finite(value)) return undefined
  const bounded = clamp(value)
  const distance = Math.min(1, Math.abs(bounded - midpoint) / (bounded < midpoint ? midpoint : 100 - midpoint))
  const palette = tone === 'volume' ? [[38, 49, 83], [34, 70, 91], [20, 109, 105]] : [[118, 43, 61], [45, 55, 69], [48, 115, 71]]
  const start = palette[1], end = bounded < midpoint ? palette[0] : palette[2]
  const rgb = start.map((channel, index) => Math.round(channel + (end[index] - channel) * distance)).join(' ')
  const tint = tone === 'volume' ? bounded < midpoint ? [137, 174, 247] : [115, 228, 201] : bounded < midpoint ? [233, 128, 145] : [169, 223, 116]
  const accent = [165, 180, 199].map((channel, index) => Math.round(channel + (tint[index] - channel) * distance)).join(' ')
  return { '--heat-rgb': accent, '--heat-strength': (.28 + distance * .3).toFixed(3), '--heat-fill': `rgb(${rgb})`, '--heat-ink': '#f4f8fc' } as CSSProperties
}
