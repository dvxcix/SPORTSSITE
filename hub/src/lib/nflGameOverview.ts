import type { SidelineGame } from '@/app/the-sideline/types'

export type NflGameMarket = 'moneyline' | 'spread' | 'total'
export type NflGameSplit = { market: NflGameMarket; side: 'away' | 'home' | 'over' | 'under'; betShare: number | null; moneyShare: number | null }
export type NflGameOverview = { gameId: string; observedAt: string; totalBets: number | null; totalHandleDollars: number | null; splits: NflGameSplit[] }
const record = (value: unknown): Record<string, unknown> | null => value != null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const bounded = (value: unknown, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null
const teamName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Project only the exact game's observed pregame shares. No inferred side
 * counts, complementary percentages, current-data substitution or book cohort. */
export function nflGameOverviewView(value: unknown, game: Pick<SidelineGame, 'id' | 'away' | 'home'>, cutoff: number, now: number, at = now): NflGameOverview | null {
  const frame = record(value), snapshot = record(frame?.snapshot)
  const observed = typeof frame?.observed_at === 'string' ? Date.parse(frame.observed_at) : NaN
  const storedCutoff = typeof frame?.cutoff_at === 'string' ? Date.parse(frame.cutoff_at) : NaN
  if (!snapshot || frame?.game_id !== game.id || ![cutoff, now, at, observed, storedCutoff].every(Number.isFinite)
    || observed > Math.min(now, at) || observed >= Math.min(cutoff, storedCutoff)
    || typeof snapshot.away !== 'string' || typeof snapshot.home !== 'string'
    || teamName(snapshot.away) !== teamName(game.away.name) || teamName(snapshot.home) !== teamName(game.home.name)) return null
  const bets = bounded(snapshot.totalBets, Number.MAX_SAFE_INTEGER)
  const totalBets = Number.isSafeInteger(bets) ? bets : null
  const totalHandleDollars = bounded(snapshot.totalHandleDollars, 1e12)
  const splits: NflGameSplit[] = []
  for (const market of ['moneyline', 'spread', 'total'] as const) {
    const sides = market === 'total' ? ['over', 'under'] as const : ['away', 'home'] as const
    const group: NflGameSplit[] = []
    for (const side of sides) {
      const matches = (Array.isArray(snapshot.splits) ? snapshot.splits : []).map(record).filter(row => row?.market === market && row.side === side)
      if (matches.length === 1) group.push({ market, side, betShare: bounded(matches[0]!.betShare, 1), moneyShare: bounded(matches[0]!.moneyShare, 1) })
    }
    for (const metric of ['betShare', 'moneyShare'] as const) {
      if (group.length === 2 && group.every(row => row[metric] != null) && Math.abs(group[0][metric]! + group[1][metric]! - 1) > .01) group.forEach(row => { row[metric] = null })
    }
    splits.push(...group.filter(row => row.betShare != null || row.moneyShare != null))
  }
  return totalBets == null && totalHandleDollars == null && !splits.length ? null
    : { gameId: game.id, observedAt: new Date(observed).toISOString(), totalBets, totalHandleDollars, splits }
}
