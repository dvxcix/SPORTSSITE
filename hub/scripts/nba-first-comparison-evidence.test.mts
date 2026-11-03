import assert from 'node:assert/strict'
import test from 'node:test'
import { nbaFirstMovements } from '../src/lib/nbaFirstBasketMovement.ts'
import type { FirstBasketRow } from '../src/lib/nbaFirstBasketOdds.ts'
import type { NbaQuoteOpeningRow } from '../src/lib/nbaOddsHistory.ts'
import type { PaintGame, PaintProp } from '../src/lib/nbaPaint.ts'

const firstAt = '2026-11-03T17:00:00Z'
const laterAt = '2026-11-03T17:05:00Z'
const end = Date.parse('2026-11-03T17:06:00Z')
const game = { id: 123 } as PaintGame
const base: PaintProp = { id: -1, game_id: 123, player_id: 4, vendor: 'fanduel', prop_type: 'first_score', line_value: '0.5', market: { type: 'over_under', over_odds: 500 }, updated_at: firstAt }
const row = (offer: PaintProp) => ({ game, player: { id: 4 }, offer }) as FirstBasketRow
const opening: NbaQuoteOpeningRow = { game_id: 123, player_id: 4, vendor: 'fanduel', market: 'first_score', market_type: 'over_under', line: .5, side: 'over', odds: 500, observed_at: firstAt }
const at = (time: string, price: number): PaintProp => ({ ...base, updated_at: time, market: { type: 'over_under', over_odds: price } })
const frame = (offer: PaintProp) => ({ captured_at: offer.updated_at, props: [offer] })
const movement = (offer: PaintProp, frames: ReturnType<typeof frame>[], first = opening) => nbaFirstMovements([row(offer)], [first], { captures: frames.length, frames }, end)[0].movement!

test('a single original observation is not an unchanged movement', () => {
  const result = movement(base, [frame(base)])
  assert.equal(result.change, null)
  assert.equal(result.previousChange, null)
  assert.equal(result.firstAt, firstAt)
})

test('a distinct later unchanged quote is zero and a later changed quote has real movement', () => {
  const unchanged = movement(at(laterAt, 500), [frame(base), frame(at(laterAt, 500))])
  assert.equal(unchanged.change, 0)
  assert.equal(unchanged.previousChange, 0)
  const changed = movement(at(laterAt, 600), [frame(base), frame(at(laterAt, 600))])
  assert.ok(changed.change! < 0)
  assert.ok(changed.previousChange! < 0)
  assert.equal(changed.previousOdds, 500)
})

test('equal-time conflicting prices and future current prices never supply a comparison', () => {
  const conflict = movement(at(firstAt, 600), [frame(base)])
  assert.equal(conflict.change, null)
  assert.equal(conflict.previousChange, null)
  const laterConflict = movement(at(laterAt, 700), [frame(base), frame(at(laterAt, 600))])
  assert.equal(laterConflict.change, null)
  assert.equal(laterConflict.previousChange, null)
  const future = movement(at('2026-11-03T17:07:00Z', 600), [frame(base)])
  assert.equal(future.change, null)
  assert.equal(future.previousChange, null)
})

test('an opening from another book, event, or side cannot supply a comparison', () => {
  for (const mismatch of [{ game_id: 124 }, { player_id: 5 }, { vendor: 'draftkings' }, { market: 'first_field_goal' }, { market_type: 'milestone' }, { line: 1 }, { side: 'under' as const }]) {
    assert.equal(movement(at(laterAt, 500), [frame(base)], { ...opening, ...mismatch }).change, null)
  }
})
