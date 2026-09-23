import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildPropMap } from '../src/lib/balldontlie'
import { threePlusHrr } from '../src/lib/hrrMarket'
import { buildDugoutMarketTimeline } from '../src/lib/dugoutPresentation'
import { THRESHOLDS } from '../src/lib/pickGrading'

test('3+ cannot be overwritten by 1+, 2+, 4+ or missing-line quotes', () => {
  const rows = [0.5, 1.5, 2.5, 3.5, undefined].map((line, i) => ({
    player_id: 1, vendor: 'fanduel', prop_type: 'hits_runs_rbis',
    line_value: line == null ? null : String(line),
    market: { type: 'milestone', odds: [-230, 120, 250, 500, -999][i] },
  }))
  for (const order of [rows, [...rows].reverse()]) {
    const map = buildPropMap(order as any)
    assert.equal(threePlusHrr(map[1]), 250)
  }
})
test('legacy values require proof of over 2.5; missing is not another rung', () => {
  assert.equal(threePlusHrr({ hrr: { fanduel: -230 } }), null)
  assert.equal(threePlusHrr({ hrr: { fanduel: 460 }, hrr_line: { fanduel: 3.5 } }), null)
  assert.equal(threePlusHrr({ hrr: { fanduel: 220 }, hrr_line: { fanduel: 2.5 } }), 220)
  assert.equal(threePlusHrr({ hrr3: { fanduel: NaN } }), null)
})
test('new saved 3+ selections grade at three, without reinterpreting legacy picks', () => {
  assert.equal(THRESHOLDS.hits_runs_rbis_3plus({ hits: 1, runs: 0, rbi: 1 }), false)
  assert.equal(THRESHOLDS.hits_runs_rbis_3plus({ hits: 1, runs: 1, rbi: 1 }), true)
  assert.equal(THRESHOLDS.hits_runs_rbis({ hits: 1 }), true)
})
test('replay retains verified 3+ rather than switching to a different rung', () => {
  const points = buildDugoutMarketTimeline([
    { captured_at: '2026-09-23T12:00:00Z', prop_map: { a: { name: 'Hill', hrr: { fanduel: 220 }, hrr_line: { fanduel: 2.5 } } } },
    { captured_at: '2026-09-23T13:00:00Z', prop_map: { a: { name: 'Hill', hrr: { fanduel: 460 }, hrr_line: { fanduel: 3.5 } } } },
  ])
  assert.equal(points.at(-1)?.players.get('hill')?.hrr3?.fanduel, 220)
})
