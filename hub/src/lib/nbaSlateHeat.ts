type Bounds = [number, number] | null
export type NbaSlateHeatDomains = { average: Bounds; estimate: Bounds; gap: Bounds }
export type NbaSlateHeat = { average: number | null; estimate: number | null; gap: number | null }
type Metrics = { average: number | null; estimate: number | null; gap: number | null }
export function nbaSlateHeatDomains(rows: Metrics[]): NbaSlateHeatDomains {
  const domain = (key: keyof Metrics): Bounds => {
    const known = rows.map(row => row[key]).filter((value): value is number => value != null && Number.isFinite(value))
    if (known.length < 2) return null
    const low = Math.min(...known), high = Math.max(...known)
    return low === high ? null : [low, high]
  }
  return { average: domain('average'), estimate: domain('estimate'), gap: domain('gap') }
}
/** The same relative/zero-centered scale used by PaintHeatCell, with the
 * comparison domain frozen at this row's game cutoff. */
export function nbaSlateFrozenHeat(row: Metrics, domains?: NbaSlateHeatDomains): NbaSlateHeat {
  const level = (key: keyof Metrics) => {
    const value = row[key], bounds = domains?.[key]
    if (value == null || !Number.isFinite(value) || !Array.isArray(bounds) || bounds.length !== 2 || !bounds.every(Number.isFinite) || bounds[0] >= bounds[1]) return null
    const result = key === 'gap' ? 50 + value / Math.max(Math.abs(bounds[0]), Math.abs(bounds[1])) * 50 : (value - bounds[0]) / (bounds[1] - bounds[0]) * 100
    return Math.max(0, Math.min(100, result))
  }
  return { average: level('average'), estimate: level('estimate'), gap: level('gap') }
}
