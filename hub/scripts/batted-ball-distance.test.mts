import assert from 'node:assert/strict'
import test from 'node:test'
import { formatBattedBallDistance, resolveBattedBallDistance } from '../packages/core/src/battedBallDistance.ts'

test('official Statcast distance takes precedence over coordinates', () => {
  assert.deepEqual(
    resolveBattedBallDistance({ hit_distance: 412, hc_x: 125.42, hc_y: 198.27 }),
    { feet: 412, source: 'statcast' },
  )
  assert.equal(formatBattedBallDistance({ hit_distance: 412 }), '412 ft')
})

test('tracked coordinate supplies a clearly marked fallback distance', () => {
  const resolved = resolveBattedBallDistance({ hit_distance: null, hc_x: 125.42, hc_y: 158.27 })
  assert.equal(resolved.source, 'coordinate_estimate')
  assert.equal(Math.round(resolved.feet ?? 0), 100)
  assert.equal(formatBattedBallDistance({ hc_x: 125.42, hc_y: 158.27 }), '\u2248100 ft')
})

test('non-contact rows without distance or coordinates remain unavailable', () => {
  assert.deepEqual(resolveBattedBallDistance({}), { feet: null, source: 'unavailable' })
  assert.equal(formatBattedBallDistance({}, { unavailable: 'Not tracked' }), 'Not tracked')
})
