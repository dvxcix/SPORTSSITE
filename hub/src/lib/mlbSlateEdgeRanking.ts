export type MlbSlateEdgeRankInput = {
  gameKey: string
  lineupsConfirmed: boolean
  battingOrder: number | null
  score: number | null
  pitchFit: number | null
  barrelRecent: number | null
  barrelDelta: number | null
  barrelL3: number | null
  barrelL3Delta: number | null
  barrelL5: number | null
  barrelL5Delta: number | null
  pullAirRecent: number | null
  fhr: number | null
  fhrOpen: number | null
  hr: number | null
  hrOpen: number | null
  hrBooks: Array<{ price: number }>
  publicPicks: number | null
}

export type MlbSlateEdgeRank = {
  score: number
  marketStrength: number
  recentBarrelStrength: number
  lowPublicStrength: number
  marketPosture: 'quiet' | 'shortened' | 'lengthened' | 'mixed' | 'unavailable'
  reasons: string[]
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const oddsProbability = (odds: number | null) => odds == null
  ? null
  : odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100)
const oddsMove = (current: number | null, open: number | null) => current != null && open != null ? current - open : null

function percentile(value: number | null, values: number[], higherIsBetter = true) {
  if (value == null || values.length < 2) return value == null ? 0 : 0.5
  const ordered = [...values].sort((a, b) => a - b)
  const below = ordered.filter(candidate => candidate < value).length
  const equal = ordered.filter(candidate => candidate === value).length
  const rank = (below + Math.max(0, equal - 1) / 2) / (ordered.length - 1)
  return higherIsBetter ? rank : 1 - rank
}

function marketPosture(entry: MlbSlateEdgeRankInput) {
  const moves = [oddsMove(entry.fhr, entry.fhrOpen), oddsMove(entry.hr, entry.hrOpen)]
    .filter((value): value is number => value != null)
  if (!moves.length) return { label: 'unavailable' as const, strength: 0 }
  if (moves.every(value => Math.abs(value) <= 20)) return { label: 'quiet' as const, strength: 1 }
  const hasShort = moves.some(value => value < -20)
  const hasLong = moves.some(value => value > 20)
  if (hasShort && hasLong) return { label: 'mixed' as const, strength: 0.82 }
  if (hasLong) {
    const largest = Math.max(...moves)
    // A controlled lengthening can be concealment when the rest of the
    // profile is sound; a runaway drift is deliberately not rewarded.
    return { label: 'lengthened' as const, strength: largest <= 100 ? 0.72 : 0.35 }
  }
  return { label: 'shortened' as const, strength: 0.78 }
}

function recentBarrel(entry: MlbSlateEdgeRankInput) {
  const strengths = [
    entry.barrelL3Delta == null ? null : clamp01(entry.barrelL3Delta / 25),
    entry.barrelL5Delta == null ? null : clamp01(entry.barrelL5Delta / 15),
    entry.barrelDelta == null ? null : clamp01(entry.barrelDelta / 15),
  ].filter((value): value is number => value != null)
  return strengths.length ? Math.max(...strengths) : 0
}

function marketRange(entry: MlbSlateEdgeRankInput) {
  const prices = entry.hrBooks.map(offer => offer.price)
  return prices.length > 1 ? Math.max(...prices) - Math.min(...prices) : null
}

/**
 * Ranks pregame opportunity, not the result and not the standalone mechanics
 * index. Context is game-local so a long-priced slate does not suppress an
 * otherwise credible hitter. The interaction bonus is intentionally gated by
 * four independent facts: top-four lineup, credible book price, recent barrel
 * lift, and low public ownership. That is the quiet-profile failure mode the
 * old score-only ordering could not see.
 */
export function rankMlbSlateEdge<T extends MlbSlateEdgeRankInput>(entries: T[]) {
  const byGame = new Map<string, T[]>()
  entries.forEach(entry => byGame.set(entry.gameKey, [...(byGame.get(entry.gameKey) ?? []), entry]))
  const ranked = new Map<T, MlbSlateEdgeRank>()

  for (const gameEntries of byGame.values()) {
    const marketProbabilities = gameEntries
      .map(entry => Math.max(oddsProbability(entry.hr) ?? 0, oddsProbability(entry.fhr) ?? 0))
      .filter(value => value > 0)
    const pickCounts = gameEntries.map(entry => entry.publicPicks).filter((value): value is number => value != null)

    for (const entry of gameEntries) {
      const marketProbability = Math.max(oddsProbability(entry.hr) ?? 0, oddsProbability(entry.fhr) ?? 0)
      const marketStrength = percentile(marketProbability || null, marketProbabilities)
      const lowPublicStrength = percentile(entry.publicPicks, pickCounts, false)
      const barrelStrength = recentBarrel(entry)
      const posture = marketPosture(entry)
      const lineupStrength = !entry.lineupsConfirmed || entry.battingOrder == null ? 0 : clamp01((9 - entry.battingOrder) / 8)
      const mechanicsStrength = entry.score == null ? 0 : clamp01(entry.score / 100)
      const pullAirStrength = entry.pullAirRecent == null ? 0 : clamp01(entry.pullAirRecent / 0.3)
      const pitchStrength = entry.pitchFit == null ? 0 : clamp01((entry.pitchFit + 10) / 70)
      const disagreementStrength = clamp01((marketRange(entry) ?? 0) / 250)
      const hiddenStack = lineupStrength >= 0.625 && marketStrength >= 0.35 && barrelStrength >= 0.5 && lowPublicStrength >= 0.6

      const raw =
        mechanicsStrength * 14 +
        marketStrength * 16 +
        lineupStrength * 10 +
        barrelStrength * 22 +
        pullAirStrength * 8 +
        pitchStrength * 6 +
        posture.strength * 8 +
        lowPublicStrength * 8 +
        disagreementStrength * 4 +
        (hiddenStack ? 4 : 0)

      const reasons: string[] = []
      const bestBarrelDelta = Math.max(entry.barrelL3Delta ?? -Infinity, entry.barrelL5Delta ?? -Infinity, entry.barrelDelta ?? -Infinity)
      if (Number.isFinite(bestBarrelDelta) && bestBarrelDelta >= 5) reasons.push(`Recent barrel +${Math.round(bestBarrelDelta)}pp`)
      if (entry.lineupsConfirmed && entry.battingOrder != null && entry.battingOrder <= 4) reasons.push(`Batting #${entry.battingOrder}`)
      if (lowPublicStrength >= 0.7 && entry.publicPicks != null) reasons.push(`${entry.publicPicks.toLocaleString()} picks · low public`)
      if (posture.label === 'quiet') reasons.push('HR markets held flat')
      else if (posture.label === 'mixed') reasons.push('FHR/HR contradiction')
      else if (posture.label === 'lengthened') reasons.push('Controlled lengthening')
      else if (posture.label === 'shortened') reasons.push('Market shortened')
      if (entry.pullAirRecent != null && entry.pullAirRecent >= 0.22) reasons.push(`${Math.round(entry.pullAirRecent * 100)}% pull-air`)
      if (marketStrength >= 0.7) reasons.push('Upper-tier HR price')

      ranked.set(entry, {
        score: Math.round(Math.min(100, raw)),
        marketStrength,
        recentBarrelStrength: barrelStrength,
        lowPublicStrength,
        marketPosture: posture.label,
        reasons: reasons.slice(0, 4),
      })
    }
  }

  return ranked
}
