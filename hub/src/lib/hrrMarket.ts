/** A dedicated 3+ market. Legacy hrr may be ANY threshold: never guess. */
export function threePlusHrr(entry: {
  hrr3?: Record<string, number>
  hrr?: Record<string, number>
  hrr_line?: Record<string, number>
} | null | undefined, book = 'fanduel'): number | null {
  const value = entry?.hrr3?.[book]
    ?? (entry?.hrr_line?.[book] === 2.5 ? entry.hrr?.[book] : undefined)
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
