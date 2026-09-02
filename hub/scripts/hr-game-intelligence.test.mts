import assert from 'node:assert/strict'
import test from 'node:test'
import {
  selectQualifiedHrReads,
  type HrArchetype,
  type HrCandidateRead,
} from '../src/lib/hrGameIntelligence'

function candidate(
  name: string,
  score: number,
  archetype: HrArchetype = 'power_isolated',
  overrides: Partial<Pick<HrCandidateRead, 'evidenceScore'>> & {
    underlyingPower?: number
    pitchMatchup?: number
  } = {},
): HrCandidateRead {
  return {
    name,
    team: name.startsWith('A') ? 'AWY' : 'HME',
    battingOrder: 1,
    fhr: 1000,
    anytimeHr: 500,
    fhrOpen: 1000,
    anytimeOpen: 500,
    fhrMove: 0,
    anytimeMove: 0,
    fhrProbabilityMove: 0,
    anytimeProbabilityMove: 0,
    fhrPct: 0,
    anytimePct: 0,
    picks: 0,
    publicHrRank: 1,
    publicHrShare: 0,
    alternativePicks: 0,
    leadingAlternativeMarket: null,
    leadingAlternativePicks: 0,
    precisionScore: null,
    archetype,
    fhrScore: score,
    anytimeScore: score,
    evidenceScore: overrides.evidenceScore ?? score,
    components: {
      baselineContext: 0,
      marketStructure: 0,
      automaticSettlement: 0,
      alternativeSettlement: 0,
      recentDamage: 0,
      publicDistribution: 0,
      powerStructure: 0,
      pitchMatchup: overrides.pitchMatchup ?? 0.75,
      underlyingPower: overrides.underlyingPower ?? 0.75,
    },
    marketMoves: [],
    automaticMarketsLonger: 0,
    automaticMarketsShorter: 0,
    alternativeMarketsLonger: 0,
    alternativeMarketsShorter: 0,
    recent: {
      avgEvL3: null,
      avgEvL5: null,
      hardHitL3: null,
      hardHitL5: null,
      barrelL10: null,
      pullAirL5: null,
      batSpeedL5: null,
    },
    prices: {},
    books: {
      fhr: { fanduel: 1000, caesars: null, fanatics: null },
      hr: { fanduel: 500, caesars: null, betmgm: null, betrivers: null, fanatics: null },
    },
    windows: Object.fromEntries(['l1', 'l3', 'l5', 'l10'].map(window => [window, {
      paperRank: null,
      marketMismatch: null,
      avgEv: null,
      hardHitPct: null,
      barrelPct: null,
      sweetSpotPct: null,
      pullAirRate: null,
      fbRate: null,
      avgBatSpeed: null,
      squaredUpPct: null,
      blastPct: null,
      idealAttackAngleRate: null,
    }])) as HrCandidateRead['windows'],
    reasons: [],
    warnings: [],
  }
}

test('publishes the naturally separated top tier instead of enforcing a player-count cap', () => {
  const reads = [
    candidate('A One', 0.84),
    candidate('A Two', 0.82),
    candidate('A Three', 0.70),
    candidate('H Four', 0.67),
    candidate('H Five', 0.64, 'public_bait'),
  ]

  assert.deepEqual(
    selectQualifiedHrReads(reads, 'anytimeScore', 'advertised_explosion', true).map(read => read.name),
    ['A One', 'A Two'],
  )
})

test('abstains when the board is crowded and the leader has no real separation', () => {
  const reads = [
    candidate('A One', 0.76),
    candidate('A Two', 0.75),
    candidate('A Three', 0.74),
    candidate('H Four', 0.73),
    candidate('H Five', 0.72),
  ]

  assert.deepEqual(
    selectQualifiedHrReads(reads, 'anytimeScore', 'sparse_coherent', true),
    [],
  )
})

test('does not publish a market-shaped leader without pitch and batted-ball support', () => {
  const reads = [
    candidate('A Noise', 0.90, 'alternative_diversion', { underlyingPower: 0.40, pitchMatchup: 0.35 }),
    candidate('H Weak', 0.63),
  ]

  assert.deepEqual(
    selectQualifiedHrReads(reads, 'fhrScore', 'concealment_explosion', true),
    [],
  )
})

test('fails closed when the complete 18-player board is unavailable', () => {
  assert.deepEqual(
    selectQualifiedHrReads([candidate('A One', 0.90)], 'fhrScore', 'concealment_explosion', false),
    [],
  )
})

test('does not fill a quota with unsupported scores', () => {
  assert.deepEqual(
    selectQualifiedHrReads([candidate('A One', 0.55)], 'fhrScore', 'sparse_coherent', true),
    [],
  )
})
