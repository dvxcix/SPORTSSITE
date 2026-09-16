export type MlbSlateEdgeRankInput = {
  gameKey: string
  team?: string
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
  paper?: number | null
  fhrBaseline?: number | null
  hrBaseline?: number | null
  marketLadder?: Array<{
    key: string
    label: string
    current: number | null
    open: number | null
  }>
}

export type MlbSlateEdgeRank = {
  score: number
  marketStrength: number
  recentBarrelStrength: number
  lowPublicStrength: number
  marketPosture: 'quiet' | 'shortened' | 'lengthened' | 'mixed' | 'unavailable'
  baseScore: number
  marketStructureScore: number
  marketOverlay: number
  teamHrRank: number | null
  teamFhrRank: number | null
  paperTeamRank: number | null
  picksTeamRank: number | null
  hrBaselineProbabilityDelta: number | null
  fhrBaselineProbabilityDelta: number | null
  teamProbabilityShareDelta: number | null
  ladderShape: 'protected' | 'lengthened-retained' | 'held' | 'mixed' | 'unavailable'
  marketBadges: string[]
  marketPriceLine: string | null
  marketExplanation: string | null
  reasons: string[]
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const oddsProbability = (odds: number | null) => odds == null
  ? null
  : odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100)
const oddsMove = (current: number | null, open: number | null) => current != null && open != null ? current - open : null
const oddsLabel = (value: number | null) => value == null ? '—' : value > 0 ? `+${Math.round(value)}` : String(Math.round(value))

const probabilityDelta = (current: number | null, baseline: number | null) => {
  const currentProbability = oddsProbability(current)
  const baselineProbability = oddsProbability(baseline)
  if (currentProbability == null || baselineProbability == null || baselineProbability <= 0) return null
  return currentProbability / baselineProbability - 1
}

const probabilityMove = (current: number | null, open: number | null) => {
  const currentProbability = oddsProbability(current)
  const openProbability = oddsProbability(open)
  if (currentProbability == null || openProbability == null) return null
  return currentProbability - openProbability
}

function rankedPosition<T>(entry: T, entries: T[], value: (item: T) => number | null, higherIsBetter = true) {
  const available = entries.filter(item => value(item) != null)
  if (value(entry) == null || !available.length) return null
  const ordered = [...available].sort((a, b) => {
    const av = value(a)!
    const bv = value(b)!
    return higherIsBetter ? bv - av : av - bv
  })
  return ordered.findIndex(item => item === entry) + 1
}

function marketLadderShape(entry: MlbSlateEdgeRankInput, retained: boolean) {
  const movements = (entry.marketLadder ?? [])
    .map(line => probabilityMove(line.current, line.open))
    .filter((value): value is number => value != null)
  if (movements.length < 4) return { label: 'unavailable' as const, coverage: movements.length }
  const shortened = movements.filter(value => value >= 0.00015).length
  const lengthened = movements.filter(value => value <= -0.00015).length
  const held = movements.length - shortened - lengthened
  if (shortened / movements.length >= 0.7) return { label: 'protected' as const, coverage: movements.length }
  if (lengthened / movements.length >= 0.7 && retained) return { label: 'lengthened-retained' as const, coverage: movements.length }
  if (held / movements.length >= 0.7) return { label: 'held' as const, coverage: movements.length }
  return { label: 'mixed' as const, coverage: movements.length }
}

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
      const teammates = gameEntries.filter(candidate => candidate.team === entry.team)
      const teamHrRank = rankedPosition(entry, teammates, candidate => oddsProbability(candidate.hr))
      const teamFhrRank = rankedPosition(entry, teammates, candidate => oddsProbability(candidate.fhr))
      const paperTeamRank = rankedPosition(entry, teammates, candidate => candidate.paper ?? null)
      const picksTeamRank = rankedPosition(entry, teammates, candidate => candidate.publicPicks)
      const retainedRank = Math.min(teamHrRank ?? Infinity, teamFhrRank ?? Infinity)
      const retained = retainedRank <= 3
      const ladder = marketLadderShape(entry, retained)
      const hrBaselineDelta = probabilityDelta(entry.hr, entry.hrBaseline ?? null)
      const fhrBaselineDelta = probabilityDelta(entry.fhr, entry.fhrBaseline ?? null)

      const currentTeamProbability = teammates.reduce((sum, candidate) => sum + (oddsProbability(candidate.hr) ?? 0), 0)
      const openTeamProbability = teammates.reduce((sum, candidate) => sum + (oddsProbability(candidate.hrOpen) ?? 0), 0)
      const currentShare = currentTeamProbability > 0 ? (oddsProbability(entry.hr) ?? 0) / currentTeamProbability : null
      const openShare = openTeamProbability > 0 ? (oddsProbability(entry.hrOpen) ?? 0) / openTeamProbability : null
      const teamShareDelta = currentShare != null && openShare != null ? currentShare - openShare : null

      const teammateStrength = retainedRank === 1 ? 1 : retainedRank === 2 ? .82 : retainedRank === 3 ? .72 : retainedRank === 4 ? .48 : retainedRank < Infinity ? .25 : .5
      const baselineSignals = [hrBaselineDelta, fhrBaselineDelta].filter((value): value is number => value != null)
      const baselineStrength = baselineSignals.length
        ? clamp01(.5 + (baselineSignals.reduce((sum, value) => sum + value, 0) / baselineSignals.length) * 2.5)
        : .5
      const paperResidual = paperTeamRank != null && retainedRank < Infinity ? Math.max(0, paperTeamRank - retainedRank) : 0
      const picksResidual = picksTeamRank != null && retainedRank < Infinity ? Math.max(0, picksTeamRank - retainedRank) : 0
      const lineupResidual = entry.battingOrder != null && retainedRank < Infinity ? Math.max(0, entry.battingOrder - retainedRank) : 0
      const displacementStrength = clamp01((paperResidual * .5 + picksResidual * .3 + lineupResidual * .2) / 4)
      const shareStrength = teamShareDelta == null ? .5 : clamp01(.5 + teamShareDelta * 10)
      const ladderStrength = ladder.label === 'protected' ? .86
        : ladder.label === 'lengthened-retained' ? .74
          : ladder.label === 'held' ? .78
            : ladder.label === 'mixed' ? .58 : .5
      const marketStructureScore = Math.round(
        teammateStrength * 40 +
        baselineStrength * 18 +
        displacementStrength * 18 +
        shareStrength * 12 +
        ladderStrength * 12,
      )
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

      // Keep the existing model intact underneath a small, coverage-gated
      // market overlay. No player can gain more than six points or lose more
      // than four from this layer.
      const structureCoverage = [entry.hrBaseline, entry.fhrBaseline, entry.hrOpen, entry.fhrOpen]
        .filter(value => value != null).length + Math.min(4, ladder.coverage)
      const marketOverlay = structureCoverage >= 4
        ? Math.max(-4, Math.min(6, Math.round((marketStructureScore - 50) / 8)))
        : 0
      const baseScore = Math.round(Math.min(100, raw))

      const marketBadges: string[] = []
      if (retainedRank < Infinity && entry.battingOrder != null && entry.battingOrder - retainedRank >= 3) marketBadges.push(`B${entry.battingOrder} · Book #${retainedRank}`)
      if (retained && picksTeamRank != null && picksTeamRank - retainedRank >= 3) marketBadges.push('Low-public retained')
      if (retained && paperTeamRank != null && paperTeamRank - retainedRank >= 3) marketBadges.push(`Book #${retainedRank} · Paper #${paperTeamRank}`)
      if (ladder.label === 'lengthened-retained') marketBadges.push('Ladder long · rank held')
      else if (ladder.label === 'protected') marketBadges.push('Ladder protected')
      if (hrBaselineDelta != null && hrBaselineDelta >= .02) marketBadges.push('HR above own norm')
      else if (hrBaselineDelta != null && hrBaselineDelta <= -.02) marketBadges.push('HR below own norm')
      if (fhrBaselineDelta != null && Math.abs(fhrBaselineDelta) < .015) marketBadges.push('FHR near own norm')
      const hrDirection = hrBaselineDelta == null ? 0 : Math.sign(hrBaselineDelta)
      const fhrDirection = fhrBaselineDelta == null ? 0 : Math.sign(fhrBaselineDelta)
      if (hrDirection && fhrDirection && hrDirection !== fhrDirection) marketBadges.push('FHR / HR contradiction')

      const marketExplanation = retainedRank < Infinity
        ? `Book #${retainedRank} on ${entry.team}${paperTeamRank != null ? ` vs Paper #${paperTeamRank}` : ''}${picksTeamRank != null ? ` and Picks #${picksTeamRank}` : ''}. ${ladder.label === 'lengthened-retained' ? 'Prices lengthened broadly, but the player retained a top-three team position.' : ladder.label === 'protected' ? 'The correlated ladder shortened broadly.' : 'Team-relative price placement remains the primary market signal.'}`
        : null
      const marketPriceParts = [
        entry.hr != null && entry.hrBaseline != null ? `HR ${oddsLabel(entry.hr)} vs ${oddsLabel(entry.hrBaseline)} norm` : null,
        entry.fhr != null && entry.fhrBaseline != null ? `FHR ${oddsLabel(entry.fhr)} vs ${oddsLabel(entry.fhrBaseline)} norm` : null,
      ].filter((value): value is string => value != null)

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
        score: Math.max(0, Math.min(100, baseScore + marketOverlay)),
        marketStrength,
        recentBarrelStrength: barrelStrength,
        lowPublicStrength,
        marketPosture: posture.label,
        baseScore,
        marketStructureScore,
        marketOverlay,
        teamHrRank,
        teamFhrRank,
        paperTeamRank,
        picksTeamRank,
        hrBaselineProbabilityDelta: hrBaselineDelta,
        fhrBaselineProbabilityDelta: fhrBaselineDelta,
        teamProbabilityShareDelta: teamShareDelta,
        ladderShape: ladder.label,
        marketBadges: marketBadges.slice(0, 4),
        marketPriceLine: marketPriceParts.length ? marketPriceParts.join(' · ') : null,
        marketExplanation,
        reasons: reasons.slice(0, 4),
      })
    }
  }

  return ranked
}
