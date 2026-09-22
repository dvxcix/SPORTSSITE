/** Only completed prior weeks belong in the selected game's research sample. */
export function nflPriorWeek(week: unknown, season: number, game: { season: number; week: number }) {
  const value = Number(week)
  return Number.isInteger(value) && value > 0 && (season < game.season || (season === game.season && value < game.week))
}

type Row = Record<string, unknown>
const fields: Record<string, string[]> = {
  QB: ['completions', 'attempts', 'passing_yards', 'passing_tds', 'interceptions', 'rushing_yards', 'rushing_tds'],
  RB: ['rushing_yards', 'rushing_tds', 'receptions', 'targets', 'receiving_yards', 'receiving_tds'],
  WR: ['receptions', 'targets', 'receiving_yards', 'receiving_tds'],
  TE: ['receptions', 'targets', 'receiving_yards', 'receiving_tds'],
}
/** Same per-defense/position aggregation as the season sync, bounded BEFORE aggregation. */
export function pregameDvp(rows: Row[]) {
  const groups = new Map<string, { weeks: Set<number>; totals: Record<string, number> }>()
  for (const row of rows) {
    const position = String(row.position ?? '')
    if (!fields[position] || !row.opponent_team || Number(row.week) <= 0) continue
    const key = `${row.opponent_team}|${position}`
    const group = groups.get(key) ?? { weeks: new Set<number>(), totals: {} }
    group.weeks.add(Number(row.week))
    for (const field of fields[position]) group.totals[field] = (group.totals[field] ?? 0) + (Number(row[field]) || 0)
    groups.set(key, group)
  }
  return [...groups].flatMap(([key, group]) => {
    const [opponent_team, position] = key.split('|')
    const peers = [...groups].filter(([peer]) => peer.endsWith(`|${position}`)).map(([, value]) => value)
    return fields[position].flatMap(stat_category => {
      const games = peers.reduce((sum, peer) => sum + peer.weeks.size, 0)
      const baseline = peers.reduce((sum, peer) => sum + (peer.totals[stat_category] ?? 0), 0) / games
      if (!baseline) return []
      return [{ opponent_team, position, stat_category, games: group.weeks.size,
        pct_diff: ((group.totals[stat_category] / group.weeks.size) / baseline - 1) * 100 }]
    })
  })
}
