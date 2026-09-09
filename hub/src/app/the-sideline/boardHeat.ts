export type HeatColumn<T> = { id: string; heat?: 'high' | 'low' | 'none'; value: (row: T) => number | string | null; heatValue?: (row: T) => number | null; roleHeat?: boolean }

/** Compute each column's peer range once, never once per rendered cell. */
export function buildBoardHeat<T extends { id: string; position: string }>(columns: HeatColumn<T>[], rows: T[]) {
  const result = new Map<string, number>()
  for (const column of columns) {
    if (!column.heat || column.heat === 'none') continue
    const groups = new Map<string, { id: string; value: number }[]>()
    for (const row of rows) {
      const value = (column.heatValue ?? column.value)(row)
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      const group = column.roleHeat ? row.position === 'FB' ? 'RB' : row.position : 'all'
      const entries = groups.get(group) ?? []
      entries.push({ id: row.id, value }); groups.set(group, entries)
    }
    for (const entries of groups.values()) {
      if (entries.length < 2) continue
      const min = Math.min(...entries.map(entry => entry.value))
      const max = Math.max(...entries.map(entry => entry.value))
      // A tie has no relative advantage; don't paint equal observations green.
      if (min === max) continue
      for (const entry of entries) {
        const normalized = (entry.value - min) / (max - min)
        result.set(`${entry.id}:${column.id}`, column.heat === 'low' ? 1 - normalized : normalized)
      }
    }
  }
  return result
}
