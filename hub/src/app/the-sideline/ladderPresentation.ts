export type LadderSortKey = 'player' | 'score' | 'mm' | 'picks' | number
export type LadderSort = { key: LadderSortKey; direction: 'asc' | 'desc' }

/** Missing observations stay last in either direction; zero is real data. */
export function compareLadderValues(a: string | number | null | undefined, b: string | number | null | undefined, direction: LadderSort['direction']) {
  const missing = (value: typeof a) => value == null || (typeof value === 'number' && !Number.isFinite(value))
  if (missing(a)) return missing(b) ? 0 : 1
  if (missing(b)) return -1
  const difference = typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b) : Number(a) - Number(b)
  if (difference === 0) return 0
  return direction === 'asc' ? difference : -difference
}

export function ladderHeatBackground(strength: number | undefined | null) {
  return strength == null ? undefined : {
    background: 'rgba(' + (strength >= .5 ? '80,220,142' : '245,91,113') + ',' + (.04 + Math.abs(strength - .5) * .36) + ')',
  }
}
