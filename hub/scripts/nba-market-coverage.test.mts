import assert from 'node:assert/strict'
import test from 'node:test'
import { PAINT_MARKETS, nbaValue, nbaMarketLogs, nbaHitRate, nbaSelectionKey, parseNbaSelection, type PaintPlayer, type PaintProp } from '../src/lib/nbaPaint.ts'
import { nbaSlipSurgeScore } from '../src/lib/nbaIntelligence.ts'
import { sportMatrixFactorLabel } from '../src/lib/sportMatrixPresentation.ts'

test('opening-three-minute markets preserve exact saved contracts without borrowing full-game statistics', () => {
  const player = { id: 1, team: { id: 1 }, average: { pts: 30, reb: 10, ast: 12 }, logs: [], props: [] } as unknown as PaintPlayer
  for (const market of ['points_first3min', 'rebounds_first3min', 'assists_first3min']) {
    assert.ok(PAINT_MARKETS.some(item => item.key === market))
    const offer: PaintProp = { id: 1, player_id: 1, game_id: 10, vendor: 'fanduel', prop_type: market, line_value: '2', market: { type: 'milestone', odds: 120 }, updated_at: '2026-10-20T12:00:00Z' }
    assert.equal(parseNbaSelection(nbaSelectionKey(1, offer, 'over'))?.prop_key, market)
    assert.equal(nbaValue(player.average, market), null)
    assert.deepEqual(nbaMarketLogs(player, market), [])
    assert.equal(nbaHitRate([], market, 2, 'over', true).rate, null)
    assert.equal(nbaSlipSurgeScore(player, market as typeof PAINT_MARKETS[number]['key'], '2026-10-20').score, null)
  }
})

test('marketplace previews describe the actual category, exact contract, book and comparison', () => {
  const staleDefaults = { propType: 'points', marketLine: 15, marketKind: 'milestone', vendor: 'fanduel', operator: 'gte', value: 5 }
  assert.equal(sportMatrixFactorLabel({ ...staleDefaults, category: 'stats', field: 'rebounds', window: 'l10' }), 'Rebounds · L10 ≥ 5')
  assert.equal(sportMatrixFactorLabel({ ...staleDefaults, category: 'market', marketLine: 15.5, marketKind: 'over_under', marketSide: 'under', marketValue: 'probability_move', operator: 'up' }), 'Points · U 15.5 · Movement · pp · FanDuel Shortened')
  const first = sportMatrixFactorLabel({ ...staleDefaults, category: 'market', propType: 'first_score', marketLine: .5, marketKind: 'over_under', marketSide: 'over', marketValue: 'current' })
  assert.match(first, /First basket · Yes · Current odds · FanDuel ≥ 5/)
  assert.doesNotMatch(first, /0.5\+/)
})
