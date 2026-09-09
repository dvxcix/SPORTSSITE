import assert from 'node:assert/strict'
import test from 'node:test'
import { attachNflTdBaselines, mergeNflOddsBoards, nflOddsPayloadHash } from '../src/lib/nflOddsLogic.ts'
import { americanImpliedProbability, hiddenProbabilityPoints, probabilityToAmerican } from '../src/lib/nflMarketMath.ts'
import type { SidelineOddsBoard } from '../src/lib/nflOddsTypes.ts'

function board(currentOdds: number, openingOnly = false): SidelineOddsBoard {
  return {
    bdlGameId: 42,
    status: 'ready',
    capturedAt: '2026-09-07T12:00:00.000Z',
    source: 'live',
    gameLines: [{
      vendor: 'fanduel', spreadHome: -3, spreadHomeOdds: -110, spreadAway: 3,
      spreadAwayOdds: -110, moneylineHome: -150, moneylineAway: 130, total: 47.5,
      totalOverOdds: -110, totalUnderOdds: -110, opening: null, updatedAt: null,
      isOpeningOnly: openingOnly,
    }],
    players: [{
      id: 7, name: 'Test Runner', team: 'BUF', position: 'RB', markets: [{
        key: 'anytime_td:', propType: 'anytime_td', label: 'Anytime touchdown',
        category: 'touchdowns', line: null, offers: [{
          vendor: 'fanduel', line: null, openingLine: null, type: 'milestone',
          current: { odds: currentOdds }, opening: { odds: 165 }, updatedAt: null,
          isOpeningOnly: openingOnly,
        }],
      }],
    }],
  }
}

test('an opening-only response never overwrites the last captured live price', () => {
  const previous = board(120)
  const openingFallback = board(165, true)
  openingFallback.gameLines[0].moneylineHome = -130
  const merged = mergeNflOddsBoards(previous, openingFallback)
  assert.equal(merged.players[0].markets[0].offers[0].current.odds, 120)
  assert.equal(merged.gameLines[0].moneylineHome, -150)
})

test('ATD and FTD baselines retain probability points and comparable profit-price percentages', () => {
  const enriched = attachNflTdBaselines(board(120), [{
    slate_date: '2026-09-07', player_id: 7, player_name: 'Test Runner', team_abbr: 'BUF',
    vendor: 'fanduel', prop_type: 'anytime_td', average_odds: 150, sample_games: 8,
    first_sample_date: '2025-10-19', through_date: '2026-01-18',
  }])
  const baseline = enriched.players[0].tdBaselines?.[0]
  assert.equal(baseline?.averageOdds, 150)
  assert.equal(baseline?.sampleGames, 8)
  assert.equal(baseline?.deltaOdds, -30)
  assert.equal(baseline?.deltaProbabilityPoints, -5.5)
  assert.equal(baseline?.deltaPct, -0.2)

  const negativePrice = attachNflTdBaselines(board(-130), [{
    slate_date: '2026-09-07', player_id: 7, player_name: 'Test Runner', team_abbr: 'BUF',
    vendor: 'fanduel', prop_type: 'anytime_td', average_odds: -110, sample_games: 8,
    first_sample_date: '2025-10-19', through_date: '2026-01-18',
  }]).players[0].tdBaselines?.[0]
  assert.equal(negativePrice?.deltaOdds, -20)
  assert.equal(negativePrice?.deltaProbabilityPoints, -4.1)
  // -110 pays 100/110 per dollar; -130 pays 100/130. Compare payouts,
  // not signed American notation (which is discontinuous at even money).
  assert.ok(Math.abs((negativePrice?.deltaPct ?? 0) - (110 / 130 - 1)) < 1e-10)
})

test('mixed positive and negative American prices are averaged in probability space', () => {
  const probabilities = [-110, 250].map(americanImpliedProbability).filter((value): value is number => value != null)
  const average = probabilities.reduce((sum, value) => sum + value, 0) / probabilities.length
  assert.ok(average > 0.4 && average < 0.41)
  assert.ok((probabilityToAmerican(average) ?? 0) > 140)
  assert.equal(hiddenProbabilityPoints(average, americanImpliedProbability(250)), 11.9)
})

test('baseline enrichment does not create a false market-story frame', () => {
  const plain = board(120)
  const enriched = attachNflTdBaselines(plain, [{
    slate_date: '2026-09-07', player_id: 7, player_name: 'Test Runner', team_abbr: 'BUF',
    vendor: 'fanduel', prop_type: 'anytime_td', average_odds: 150, sample_games: 8,
    first_sample_date: '2025-10-19', through_date: '2026-01-18',
  }])
  assert.equal(nflOddsPayloadHash(plain), nflOddsPayloadHash(enriched))
})
