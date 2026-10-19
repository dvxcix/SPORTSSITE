import type { ReactNode } from 'react'
import { nbaHeatStyle, nbaRelativeHeat, type NbaHeatTone } from './paintHeat'
import styles from './heatmap.module.css'

export function PaintHeatCell({ value, pool = [], invert = false, heat, tone = 'volume', label, children }: {
  value: number | null | undefined; pool?: readonly (number | null | undefined)[]; invert?: boolean; heat?: number | null; tone?: NbaHeatTone; label: string; children?: ReactNode
}) {
  const level = value == null || !Number.isFinite(value) ? null : heat === undefined ? nbaRelativeHeat(value, pool, { invert }) : heat
  return <span className={styles.cell} style={nbaHeatStyle(level, 50, tone)} data-heat-value={level == null ? 'neutral' : level.toFixed(2)} data-heat-tone={tone} aria-label={label}>
    {children ?? (value == null || !Number.isFinite(value) ? '—' : value)}
  </span>
}

export function PaintHeatLegend({ low = 'Lower volume', high = 'Higher volume', tone = 'volume' }: { low?: string; high?: string; tone?: NbaHeatTone }) {
  return <span className={styles.legend}><span>{low}</span><i data-tone={tone} aria-hidden="true"/><span>{high}</span></span>
}
