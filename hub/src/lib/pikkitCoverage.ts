export const MLB_PIKKIT_COMPLETE_MARKETS = 6
export const MLB_PIKKIT_COMPLETE_PLAYERS = 10
export const MLB_PIKKIT_COMPLETE_ROWS = 15

export type PikkitCoverage = {
  marketCount: number
  playerCount: number
  rowCount: number
  hasHomeRuns: boolean
  complete: boolean
}

function finish(markets: Set<string>, players: Set<string>, rowCount: number): PikkitCoverage {
  const marketCount = markets.size
  const playerCount = players.size
  const hasHomeRuns = [...markets].some(market => /^(?:hr|home_?runs?)$/i.test(market))
  return {
    marketCount,
    playerCount,
    rowCount,
    hasHomeRuns,
    complete: hasHomeRuns
      && marketCount >= MLB_PIKKIT_COMPLETE_MARKETS
      && playerCount >= MLB_PIKKIT_COMPLETE_PLAYERS
      && rowCount >= MLB_PIKKIT_COMPLETE_ROWS,
  }
}

export function summarizePikkitPayload(payload: { props?: Record<string, Record<string, number>> } | null | undefined): PikkitCoverage {
  const markets = new Set<string>()
  const players = new Set<string>()
  let rowCount = 0
  for (const [market, rows] of Object.entries(payload?.props ?? {})) {
    if (!rows || typeof rows !== 'object' || Array.isArray(rows)) continue
    const names = Object.keys(rows)
    if (!names.length) continue
    markets.add(market)
    for (const name of names) {
      if (name.trim()) players.add(name.trim().toLowerCase())
      rowCount++
    }
  }
  return finish(markets, players, rowCount)
}

export function summarizePikkitRows(rows: Array<{ prop_type?: string | null; player_name?: string | null }>): PikkitCoverage {
  const markets = new Set<string>()
  const players = new Set<string>()
  for (const row of rows) {
    if (row.prop_type) markets.add(row.prop_type)
    if (row.player_name) players.add(row.player_name.trim().toLowerCase())
  }
  return finish(markets, players, rows.length)
}
