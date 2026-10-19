/** Shared display grouping, independent of proprietary scoring calculations. */
export function nbaPosition(position: string | null | undefined) {
  const first = position?.toUpperCase().split('-')[0]
  return first === 'C' ? 'C' : first && /G/.test(first) ? 'G' : first && /F/.test(first) ? 'F' : null
}
