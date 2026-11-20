import type { PaintGame } from './nbaPaint'

export type NbaGameMarket = 'moneyline' | 'spread' | 'total'
export type NbaGameSplit = { market: NbaGameMarket; side: 'away' | 'home' | 'over' | 'under'; betShare: number | null; moneyShare: number | null }
export type NbaGameOverview = { gameId: number; observedAt: string; totalBets: number | null; totalHandleDollars: number | null; splits: NbaGameSplit[] }

const record = (value: unknown): Record<string, unknown> | null => value != null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const bounded = (value: unknown, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null
const teamName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^losangelesclippers$/, 'laclippers')

/** Only project observed public aggregates. Never derive side counts from the
 * all-market count, or mistake the source's period groups for sportsbooks. */
export function nbaGameOverviewView(value: unknown, game: Pick<PaintGame, 'id' | 'visitor_team' | 'home_team'>, cutoff: number, now: number): NbaGameOverview | null {
  const frame = record(value), snapshot = record(frame?.snapshot)
  const observed = typeof frame?.observed_at === 'string' ? Date.parse(frame.observed_at) : NaN
  const storedCutoff = typeof frame?.cutoff_at === 'string' ? Date.parse(frame.cutoff_at) : NaN
  if (!snapshot || String(frame?.game_id) !== String(game.id) || !Number.isFinite(cutoff) || !Number.isFinite(now)
    || !Number.isFinite(observed) || !Number.isFinite(storedCutoff) || observed > now || observed >= Math.min(cutoff, storedCutoff)
    || typeof snapshot.away !== 'string' || typeof snapshot.home !== 'string'
    || teamName(snapshot.away) !== teamName(game.visitor_team.full_name) || teamName(snapshot.home) !== teamName(game.home_team.full_name)) return null
  const bets = bounded(snapshot.totalBets, Number.MAX_SAFE_INTEGER)
  const totalBets = Number.isSafeInteger(bets) ? bets : null
  const totalHandleDollars = bounded(snapshot.totalHandleDollars, 1e12)
  const splits: NbaGameSplit[] = []
  for (const market of ['moneyline', 'spread', 'total'] as const) {
    const sides = market === 'total' ? ['over', 'under'] as const : ['away', 'home'] as const
    const group: NbaGameSplit[] = []
    for (const side of sides) {
      const matches = (Array.isArray(snapshot.splits) ? snapshot.splits : []).map(record).filter(row => row?.market === market && row.side === side)
      if (matches.length !== 1) continue
      group.push({ market, side, betShare: bounded(matches[0]!.betShare, 1), moneyShare: bounded(matches[0]!.moneyShare, 1) })
    }
    // Conflicting source pairs stay unavailable. Partial sides do not imply a
    // complement; the UI only draws a complete bar from two observed shares.
    for (const metric of ['betShare', 'moneyShare'] as const) {
      if (group.length === 2 && group.every(row => row[metric] != null) && Math.abs(group[0][metric]! + group[1][metric]! - 1) > .01) group.forEach(row => { row[metric] = null })
    }
    splits.push(...group.filter(row => row.betShare != null || row.moneyShare != null))
  }
  if (totalBets == null && totalHandleDollars == null && !splits.length) return null
  return { gameId: game.id, observedAt: new Date(observed).toISOString(), totalBets, totalHandleDollars, splits }
}
