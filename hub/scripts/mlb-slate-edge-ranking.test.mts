import assert from 'node:assert/strict'
import test from 'node:test'
import { rankMlbSlateEdge, type MlbSlateEdgeRankInput } from '../src/lib/mlbSlateEdgeRanking'

type Fixture = MlbSlateEdgeRankInput & { name: string }

const base = (name: string, input: Partial<Fixture>): Fixture => ({
  name,
  gameKey: 'LAD-CIN',
  lineupsConfirmed: true,
  battingOrder: 6,
  score: 35,
  pitchFit: 20,
  barrelRecent: 0,
  barrelDelta: -5,
  barrelL3: 0,
  barrelL3Delta: -5,
  barrelL5: 0,
  barrelL5Delta: -5,
  pullAirRecent: 0.12,
  fhr: 1500,
  fhrOpen: 1500,
  hr: 700,
  hrOpen: 700,
  hrBooks: [{ price: 700 }, { price: 750 }],
  publicPicks: 150,
  ...input,
})

test('quiet elite profile is surfaced even when mechanics score alone is modest', () => {
  const tucker = base('Kyle Tucker', {
    battingOrder: 4,
    score: 36,
    pitchFit: 13,
    barrelRecent: 25,
    barrelDelta: 0,
    barrelL3: 33.3,
    barrelL3Delta: 26.44,
    barrelL5: 20,
    barrelL5Delta: 13.1,
    pullAirRecent: 0.25,
    fhr: 1100,
    fhrOpen: 1100,
    hr: 520,
    hrOpen: 520,
    hrBooks: [{ price: 520 }, { price: 670 }],
    publicPicks: 26,
  })
  const slate = [
    base('Score-only leader', { battingOrder: 9, score: 68, hr: 900, fhr: 2200, publicPicks: 400 }),
    base('Advertised favorite', { battingOrder: 2, score: 47, hr: 340, hrOpen: 370, fhr: 650, fhrOpen: 700, publicPicks: 848 }),
    base('Recent barrel one', { battingOrder: 3, score: 57, barrelL3Delta: 28, barrelL5Delta: 18, hr: 470, publicPicks: 64 }),
    base('Recent barrel two', { battingOrder: 2, score: 52, barrelL3Delta: 20, barrelL5Delta: 12, hr: 450, publicPicks: 116 }),
    base('Market favorite', { battingOrder: 3, score: 22, barrelL3Delta: 18, hr: 340, publicPicks: 255 }),
    base('Market mismatch', { battingOrder: 6, score: 60, barrelL3Delta: 0, hr: 830, publicPicks: 96 }),
    base('Low-order power', { battingOrder: 7, score: 50, barrelL3Delta: 16, hr: 500, publicPicks: 62 }),
    tucker,
  ]
  const ranks = rankMlbSlateEdge(slate)
  const ordered = [...slate].sort((a, b) => ranks.get(b)!.score - ranks.get(a)!.score)
  const tuckerRank = ordered.findIndex(player => player === tucker) + 1

  assert.ok(tuckerRank > 0 && tuckerRank <= 6, 'Tucker archetype should remain in the actionable top tier')
  assert.ok(ranks.get(tucker)!.reasons.includes('HR markets held flat'))
  assert.ok(ranks.get(tucker)!.reasons.some(reason => reason.includes('low public')))
  assert.ok(ranks.get(tucker)!.recentBarrelStrength > 0.85)
})

test('public popularity is not mistaken for hidden-signal strength', () => {
  const quiet = base('Quiet player', { publicPicks: 20, battingOrder: 4, barrelL3Delta: 20, hr: 500 })
  const advertised = base('Popular player', { publicPicks: 500, battingOrder: 4, barrelL3Delta: 20, hr: 500 })
  const ranks = rankMlbSlateEdge([quiet, advertised])

  assert.ok(ranks.get(quiet)!.score > ranks.get(advertised)!.score)
  assert.equal(ranks.get(quiet)!.lowPublicStrength, 1)
  assert.equal(ranks.get(advertised)!.lowPublicStrength, 0)
})

test('projected batting-order placeholders do not receive lineup credit', () => {
  const confirmed = base('Confirmed cleanup hitter', { battingOrder: 4, lineupsConfirmed: true })
  const projected = base('Projected cleanup hitter', { battingOrder: 4, lineupsConfirmed: false })
  const ranks = rankMlbSlateEdge([confirmed, projected])

  assert.ok(ranks.get(confirmed)!.score > ranks.get(projected)!.score)
  assert.ok(ranks.get(confirmed)!.reasons.includes('Batting #4'))
  assert.ok(!ranks.get(projected)!.reasons.includes('Batting #4'))
})
