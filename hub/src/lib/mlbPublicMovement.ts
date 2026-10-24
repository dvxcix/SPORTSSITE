import { canonGameKey } from '@slipsurge/core/teamAbbr'

export type MlbPublicMovement = {
  previous: number | null
  delta: number | null
  capturedAt: string
  previousAt: string | null
}
type CurrentPublicRow = { player_name: string | null; game_key: string | null; prop_type: string | null; picks: number | null }
export type MlbPublicMovementRow = {
  gameKey: string; playerName: string; market: string; current: number
  previous: number | null; delta: number | null; capturedAt: string; previousAt: string | null
}
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const key = (game: string, player: string, market: string) => JSON.stringify([canonGameKey(game), player.trim().toLowerCase(), market])

// Match current totals exactly. History never replaces them, nor attaches to
// an unscoped legacy row or a fuzzy player/market match.
export function attachMlbPublicMovement<T extends CurrentPublicRow>(current: T[], history: MlbPublicMovementRow[], canReadGame: (gameKey: string) => boolean = () => true): Array<T & { movement: MlbPublicMovement | null }> {
  const indexed = new Map<string, MlbPublicMovementRow | null>()
  for (const row of history) {
    const identity = key(row.gameKey, row.playerName, row.market)
    indexed.set(identity, indexed.has(identity) ? null : row)
  }
  return current.map(row => {
    const match = row.game_key && canReadGame(canonGameKey(row.game_key)) && row.player_name && row.prop_type ? indexed.get(key(row.game_key, row.player_name, row.prop_type)) : null
    if (!match || !count(row.picks) || match.current !== row.picks || !Number.isFinite(Date.parse(match.capturedAt))) return { ...row, movement: null }
    const baseline = count(match.previous) && match.previousAt != null && Number.isFinite(Date.parse(match.previousAt)) && Date.parse(match.previousAt) < Date.parse(match.capturedAt)
    return { ...row, movement: {
      previous: baseline ? match.previous : null,
      delta: baseline ? row.picks - match.previous! : null,
      capturedAt: match.capturedAt,
      previousAt: baseline ? match.previousAt : null,
    } }
  })
}

export type MlbPublicSort = 'picks' | 'increase' | 'decrease'
export function compareMlbPublicRows(a: { picks: number; movement?: MlbPublicMovement | null }, b: { picks: number; movement?: MlbPublicMovement | null }, sort: MlbPublicSort): number {
  if (sort !== 'picks') {
    const left = a.movement?.delta ?? null, right = b.movement?.delta ?? null
    if (left == null && right != null) return 1
    if (left != null && right == null) return -1
    if (left != null && right != null && left !== right) return sort === 'increase' ? right - left : left - right
  }
  return b.picks - a.picks
}

const compactCount = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1, maximumSignificantDigits: 3 })
export function publicCountText(value: number): string { return compactCount.format(value) }

export function publicCountDeltaText(delta: number | null | undefined, compact = false): string {
  if (delta == null) return 'Δ —'
  return `Δ${compact ? '' : ' '}${delta > 0 ? '+' : delta < 0 ? '−' : ''}${compact ? publicCountText(Math.abs(delta)) : Math.abs(delta).toLocaleString('en-US')}`
}
