export type DugoutColumnPrefs = {
  hiddenGroups?: string[]
  hiddenColumns?: string[]
  columnOrder?: string[]
}

type DugoutColumn = { key: string; group: string }

/** Apply a member's saved layout without mutating either input. */
export function applyDugoutColumnPrefs<T extends DugoutColumn>(
  columns: readonly T[],
  prefs: DugoutColumnPrefs | null | undefined,
): T[] {
  const hiddenGroups = new Set(prefs?.hiddenGroups ?? [])
  const hiddenColumns = new Set(prefs?.hiddenColumns ?? [])
  const orderRank = new Map((prefs?.columnOrder ?? []).map((key, index) => [key, index]))

  return columns
    .filter(column => !hiddenGroups.has(column.group) && !hiddenColumns.has(column.key))
    .map((column, defaultIndex) => ({ column, defaultIndex }))
    .sort((left, right) => {
      const leftRank = orderRank.get(left.column.key)
      const rightRank = orderRank.get(right.column.key)
      if (leftRank != null && rightRank != null) return leftRank - rightRank
      if (leftRank != null) return -1
      if (rightRank != null) return 1
      return left.defaultIndex - right.defaultIndex
    })
    .map(({ column }) => column)
}
