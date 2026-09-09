import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBoardHeat } from '../src/app/the-sideline/boardHeat'

const rows = [{ id: 'qb', position: 'QB', yards: 4000 }, { id: 'wr1', position: 'WR', yards: 500 }, { id: 'wr2', position: 'WR', yards: 1500 }]
test('role heat compares receivers to receivers, not quarterback season yardage', () => {
  let calls = 0
  const heat = buildBoardHeat([{ id: 'yards', heat: 'high', roleHeat: true, value: row => { calls++; return row.yards } }], rows)
  assert.equal(heat.get('wr1:yards'), 0)
  assert.equal(heat.get('wr2:yards'), 1)
  assert.equal(heat.has('qb:yards'), false)
  assert.equal(calls, rows.length)
})
test('equal and missing observations remain neutral', () => {
  assert.equal(buildBoardHeat([{ id: 'same', heat: 'high', value: () => 0 }], rows).size, 0)
  assert.equal(buildBoardHeat([{ id: 'missing', heat: 'high', value: () => null }], rows).size, 0)
})
test('inverse metrics and explicit heat values preserve direction', () => {
  const heat = buildBoardHeat([{ id: 'yards', heat: 'low', value: () => 0, heatValue: row => row.yards }], rows)
  assert.equal(heat.get('qb:yards'), 0)
  assert.equal(heat.get('wr1:yards'), 1)
})
