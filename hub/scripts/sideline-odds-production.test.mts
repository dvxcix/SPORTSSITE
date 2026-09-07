import assert from 'node:assert/strict'
import test from 'node:test'
import { attachNflTdBaselines, mergeNflOddsBoards, nflOddsPayloadHash } from '../src/lib/nflOddsLogic.ts'
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

test('ATD and FTD baselines remain slate-frozen and calculate raw-price movement', () => {
  const enriched = attachNflTdBaselines(board(120), [{
    slate_date: '2026-09-07', player_id: 7, player_name: 'Test Runner', team_abbr: 'BUF',
    vendor: 'fanduel', prop_type: 'anytime_td', average_odds: 150, sample_games: 8,
    first_sample_date: '2025-10-19', through_date: '2026-01-18',
  }])
  const baseline = enriched.players[0].tdBaselines?.[0]
  assert.equal(baseline?.averageOdds, 150)
  assert.equal(baseline?.sampleGames, 8)
  assert.equal(baseline?.deltaOdds, -30)
  assert.equal(baseline?.deltaPct, -0.2)

  const negativePrice = attachNflTdBaselines(board(-130), [{
    slate_date: '2026-09-07', player_id: 7, player_name: 'Test Runner', team_abbr: 'BUF',
    vendor: 'fanduel', prop_type: 'anytime_td', average_odds: -110, sample_games: 8,
    first_sample_date: '2025-10-19', through_date: '2026-01-18',
  }]).players[0].tdBaselines?.[0]
  assert.equal(negativePrice?.deltaOdds, -20)
  assert.equal(negativePrice?.deltaPct, (-130 - -110) / -110)
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
