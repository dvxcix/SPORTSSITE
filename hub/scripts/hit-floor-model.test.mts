import assert from 'node:assert/strict'
import test from 'node:test'
import { computeHitFloorReads, computeHitPitchProfile, type HitFloorInput, type HitWindow } from '../src/lib/hitFloorModel'

const window = (value: number): HitWindow => ({
  squaredUpPct: value,
  sweetSpotPct: value,
  missDistance: 20 - value / 5,
  onTimePct: value,
  hardHitPct: value,
  avgEv: 70 + value / 4,
})

function row(index: number): HitFloorInput {
  const strong = index === 0
  const value = strong ? 90 : 20 + index
  return {
    name: `Player ${index + 1}`,
    team: index < 9 ? 'AWY' : 'HME',
    batting_order: index % 9 + 1,
    hits_fd: strong ? -300 : 100 + index * 10,
    hits2_fd: strong ? 120 : 250 + index * 10,
    sng_fd: strong ? 110 : 300 + index * 10,
    hits_open: strong ? -260 : 100 + index * 10,
    hits2_open: strong ? 135 : 250 + index * 10,
    recent_pitch_count: 60,
    platoon_ops: strong ? 1.000 : 0.600 + index / 100,
    hit_windows: { l1: window(value), l3: window(value), l5: window(value), l10: window(value) },
    hit_pitch_profile: {
      score: strong ? 0.82 : 0.55,
      coverage: 0.85,
      supportedPitches: 3,
      highUsageTraps: [],
      reasons: [],
    },
  }
}

test('qualifies only complete, high-coverage, cross-signal hit reads', () => {
  const rows = Array.from({ length: 18 }, (_, index) => row(index))
  computeHitFloorReads(rows, true)

  assert.equal(rows[0].hit_status, 'QUALIFIED')
  assert.equal(rows[0].hit_rank, 1)
  assert.ok((rows[0].hit_score ?? 0) > 80)
  assert.equal(rows.filter(item => item.hit_status === 'QUALIFIED').length, 1)
})

test('fails closed when the confirmed 18-player board is unavailable', () => {
  const rows = Array.from({ length: 18 }, (_, index) => row(index))
  computeHitFloorReads(rows, false)

  assert.equal(rows[0].hit_status, 'PASS')
  assert.ok(rows[0].hit_warnings?.some(reason => reason.includes('18-player board')))
})

test('a real high-usage pitch whiff cluster vetoes an otherwise strong card', () => {
  const rows = Array.from({ length: 18 }, (_, index) => row(index))
  rows[0].hit_pitch_profile.highUsageTraps = ['FF', 'SL']
  computeHitFloorReads(rows, true)

  assert.equal(rows[0].hit_status, 'PASS')
  assert.ok(rows[0].hit_warnings?.some(reason => reason.includes('Multiple high-usage whiff traps')))
})

test('pitch profile weights contact on the starter mix and reports coverage', () => {
  const profile = computeHitPitchProfile(
    'R',
    'L',
    { pct_fastball: 60, pct_slider: 30 },
    { recentByPitchTypeByHand: { R: {
      FF: { pitches: 40, whiffPct: 10, hardHitPct: 35 },
      SL: { pitches: 30, whiffPct: 18, hardHitPct: 30 },
    } } },
    { recentByPitchTypeByHand: { L: {
      FF: { pitches: 50, whiffPct: 18, hardHitPct: 40 },
      SL: { pitches: 35, whiffPct: 22, hardHitPct: 38 },
    } } },
  )

  assert.equal(profile.coverage, 1)
  assert.equal(profile.supportedPitches, 2)
  assert.ok((profile.score ?? 0) > 0.70)
  assert.deepEqual(profile.highUsageTraps, [])
})

