import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { attachMlbPublicMovement, compareMlbPublicRows, publicCountDeltaText, type MlbPublicMovementRow } from '../src/lib/mlbPublicMovement'
import { PickBadge } from '../src/components/shared/OddsBadges'

const current = { player_name: 'Brice Turang', game_key: 'TB@MIL', prop_type: 'home_runs', picks: 17 }
const history: MlbPublicMovementRow = { gameKey: 'TB@MIL', playerName: 'Brice Turang', market: 'home_runs', current: 17, previous: 9, delta: 8, capturedAt: '2026-10-24T14:00:00.000Z', previousAt: '2026-10-24T08:00:00.000Z' }

test('verified matching latest totals expose a real prior capture and signed change', () => {
  const [row] = attachMlbPublicMovement([current], [history])
  assert.equal(row.picks, 17)
  assert.deepEqual(row.movement, { previous: 9, delta: 8, capturedAt: history.capturedAt, previousAt: history.previousAt })
  assert.equal(attachMlbPublicMovement([{ ...current, picks: 0 }], [{ ...history, current: 0 }])[0].movement?.delta, -9)
})

test('history never crosses a doubleheader, market, player identity, or mismatched latest count', () => {
  for (const wrong of [
    { ...history, gameKey: 'TB@MIL-G2' }, { ...history, gameKey: 'MIL@TB' },
    { ...history, market: 'hits' }, { ...history, playerName: 'Brice A Turang' }, { ...history, current: 18 },
  ]) assert.equal(attachMlbPublicMovement([current], [wrong])[0].movement, null)
  assert.equal(attachMlbPublicMovement([{ ...current, game_key: '' }], [history])[0].movement, null)
  assert.equal(attachMlbPublicMovement([current], [history, history])[0].movement, null)
})

test('missing baseline stays null; real zero and unchanged baselines remain numeric', () => {
  assert.equal(attachMlbPublicMovement([current], [])[0].picks, 17)
  assert.equal(attachMlbPublicMovement([current], [])[0].movement, null)
  for (const missing of [
    { ...history, previous: null, previousAt: null }, { ...history, previousAt: history.capturedAt },
    { ...history, previousAt: '2026-10-25T08:00:00Z' }, { ...history, previousAt: 'invalid' },
  ]) assert.equal(attachMlbPublicMovement([current], [missing])[0].movement?.delta, null)
  assert.equal(attachMlbPublicMovement([current], [{ ...history, previous: 0 }])[0].movement?.delta, 17)
  assert.equal(attachMlbPublicMovement([current], [{ ...history, previous: 17 }])[0].movement?.delta, 0)
})

test('premium movement gate preserves counts without exposing previous counts or capture timestamps', () => {
  const other = { ...current, game_key: 'TB@MIL-G2' }
  const rows = attachMlbPublicMovement([current, other], [history, { ...history, gameKey: 'TB@MIL-G2' }], gameKey => gameKey === 'TB@MIL-G2')
  assert.equal(rows[0].picks, 17)
  assert.equal(rows[0].movement, null)
  assert.equal(JSON.stringify(rows[0]).includes('capturedAt'), false)
  assert.equal(rows[1].movement?.delta, 8)
  assert.equal(attachMlbPublicMovement([current], [history], () => false)[0].movement, null)
})

test('increases/decreases sort by actual movement and leave unavailable baselines last', () => {
  const rows = attachMlbPublicMovement([
    { ...current, player_name: 'Up', picks: 8 }, { ...current, player_name: 'Down', picks: 4 },
    { ...current, player_name: 'Unknown', picks: 99 }, { ...current, player_name: 'Flat', picks: 20 },
  ], [
    { ...history, playerName: 'Up', current: 8, previous: 3 },
    { ...history, playerName: 'Down', current: 4, previous: 7 },
    { ...history, playerName: 'Flat', current: 20, previous: 20 },
  ])
  assert.deepEqual([...rows].sort((a, b) => compareMlbPublicRows(a, b, 'increase')).map(row => row.player_name), ['Up', 'Flat', 'Down', 'Unknown'])
  assert.deepEqual([...rows].sort((a, b) => compareMlbPublicRows(a, b, 'decrease')).map(row => row.player_name), ['Down', 'Flat', 'Up', 'Unknown'])
  assert.deepEqual([...rows].sort((a, b) => compareMlbPublicRows(a, b, 'picks')).map(row => row.player_name), ['Unknown', 'Flat', 'Up', 'Down'])
})

test('count badge renders signed movement without tooltip and distinguishes missing from unchanged', () => {
  const [row] = attachMlbPublicMovement([current], [history])
  for (const [delta, text] of [[8, 'Δ +8'], [-9, 'Δ −9'], [0, 'Δ 0'], [null, 'Δ —']] as const) {
    const html = renderToStaticMarkup(createElement(PickBadge, { picks: 17, label: 'HR', movement: { ...row.movement!, delta } }))
    assert.ok(html.includes(text))
    assert.ok(!html.includes('title='))
    assert.ok(!html.includes('tooltip'))
  }
  assert.equal(publicCountDeltaText(undefined), 'Δ —')
  const compact = renderToStaticMarkup(createElement(PickBadge, { picks: 1_000_000, label: 'HR', compact: true, movement: { ...row.movement!, delta: 1_000_000 } }))
  assert.ok(compact.includes('Δ+1M'))
  assert.ok(compact.includes('+1000000 since previous capture'))
  assert.equal(renderToStaticMarkup(createElement(PickBadge, { picks: null, label: 'HR' })), '')
})
