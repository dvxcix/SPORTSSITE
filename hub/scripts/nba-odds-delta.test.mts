import assert from 'node:assert/strict'
import test from 'node:test'
import { nbaOddsDelta } from '../src/lib/nbaOddsDelta.ts'
import { nbaMovement } from '../src/lib/nbaMovement.ts'
import type { PaintProp } from '../src/lib/nbaPaint.ts'

const quote = (vendor: string, line: string, over = -110, under = -110): PaintProp => ({ id: Number(line) * 10, game_id: 123, player_id: 1, vendor, prop_type: 'points', line_value: line, market: { type: 'over_under', over_odds: over, under_odds: under }, updated_at: '2026-10-19T00:00:00Z' })

test('NBA odds delta handles shortening, lengthening, even-money crossing and unknowns', () => {
  assert.equal(nbaOddsDelta(120, -120)?.direction, 'shorter')
  assert.ok(Math.abs(nbaOddsDelta(120, -120)!.pp - 9.09090909) < 1e-6)
  assert.equal(nbaOddsDelta(-120, 120)?.direction, 'longer')
  assert.equal(nbaOddsDelta(-110, -120)?.direction, 'shorter')
  assert.equal(nbaOddsDelta(300, 400)?.direction, 'longer')
  assert.deepEqual(nbaOddsDelta(-100, 100), { pp: 0, direction: 'flat' })
  assert.deepEqual(nbaOddsDelta(-110, -110), { pp: 0, direction: 'flat' })
  for (const unknown of [null, undefined, NaN, Infinity, 0, 50]) {
    assert.equal(nbaOddsDelta(unknown, -110), null)
    assert.equal(nbaOddsDelta(-110, unknown), null)
  }
})

test('another sportsbook cannot manufacture NBA reference-line movement', () => {
  const own = [quote('fanduel', '20.5'), quote('fanduel', '21.5', 120, -140)]
  const result = nbaMovement([
    { captured_at: '2026-10-19T01:00:00Z', props: [...own, quote('draftkings', '20.5'), quote('betmgm', '20.5')] },
    { captured_at: '2026-10-19T02:00:00Z', props: [...own, quote('draftkings', '21.5'), quote('betmgm', '21.5')] },
  ], 1, 'points', 'fanduel')
  assert.equal(result.lineChange, 0)
  assert.equal(result.priceChange, 0)
  assert.deepEqual(result.points.map(point => point.line), [20.5, 20.5])
})

test('NBA line movement and same-threshold price movement stay independent', () => {
  const frames = [
    { captured_at: '2026-10-19T01:00:00Z', props: [quote('fanduel', '20.5')] },
    { captured_at: '2026-10-19T02:00:00Z', props: [quote('fanduel', '21.5', -120, 100)] },
  ]
  const result = nbaMovement(frames, 1, 'points', 'fanduel')
  assert.equal(result.lineChange, 1)
  assert.equal(result.priceChange, null, 'a new threshold has no earlier comparable price')
  assert.equal(nbaMovement([...frames, { captured_at: '2026-10-19T03:00:00Z', props: [] }], 1, 'points', 'fanduel').latest, null, 'removed markets are not presented as current')
})

test('quarter milestone history remains available with book-local reference selection', () => {
  const first = { ...quote('fanduel', '5'), prop_type: 'points_1q', market: { type: 'milestone' as const, odds: 120 } }
  const result = nbaMovement([
    { captured_at: '2026-10-19T01:00:00Z', props: [first] },
    { captured_at: '2026-10-19T02:00:00Z', props: [{ ...first, market: { ...first.market, odds: 150 } }] },
  ], 1, 'points_1q', 'fanduel')
  assert.equal(result.latest?.line, 5)
  assert.equal(result.lineChange, 0)
  assert.equal(result.priceFirstOdds, 120)
  assert.equal(result.priceLatestOdds, 150)
  assert.ok(result.priceChange! < 0)
})
