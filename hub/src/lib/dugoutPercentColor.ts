import type { CSSProperties } from 'react'

/** Canonical FHR% / HR% presentation shared with The Dugout. */
export function getDugoutPercentStyle(
  pct: number | null,
  delta: number | null,
  deltaPool: Array<number | null>,
): CSSProperties {
  if (pct == null) return { color: 'var(--text-3)' }
  const magnitudes = deltaPool
    .filter((value): value is number => value != null)
    .map(value => Math.abs(value))
  const maxMagnitude = magnitudes.length ? Math.max(...magnitudes) : 0
  const intensity = maxMagnitude > 0 && delta != null
    ? Math.min(Math.abs(delta) / maxMagnitude, 1)
    : 0

  if (Math.abs(pct) < 0.03) return { color: '#eab308', fontWeight: 700 }

  const alpha = 0.55 + intensity * 0.45
  return {
    color: pct < 0
      ? `rgba(74,222,128,${alpha})`
      : `rgba(248,113,113,${alpha})`,
    fontWeight: 700,
  }
}
