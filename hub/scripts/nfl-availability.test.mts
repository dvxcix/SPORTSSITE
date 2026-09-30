import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nflAvailability, withGameAvailability } from '../src/lib/nflAvailability'
import { teamMmHighlights } from '../src/app/the-sideline/teamHighlights'
import { EMPTY_SIDELINE_ODDS, type NflOddsPlayer } from '../src/lib/nflOddsTypes'

const availability = (status: string | null, active: boolean | null = null) => ({ gameStatus: status, active, injury: 'Knee', starter: false, didNotPlay: false, updatedAt: null })
test('confirmed unavailable designations are ineligible even with a posted price', () => {
  for (const status of ['Out', 'O', 'IR', 'Reserve/PUP', 'Inactive', 'Suspended', 'DNP']) {
    assert.equal(nflAvailability({ availability: availability(status) }).eligible, false, status)
  }
})
test('questionable, doubtful and injury description alone are not confirmed out', () => {
  for (const status of ['Questionable', 'Doubtful', null]) assert.equal(nflAvailability({ availability: availability(status) }).eligible, true)
})
test('today roster injury cannot rewrite a prior game', () => {
  assert.equal(nflAvailability({ rosterStatus: 'IR' }, '2026-09-20', '2026-09-30').eligible, true)
  assert.equal(nflAvailability({ rosterStatus: 'IR' }, '2026-10-04', '2026-09-30').eligible, false)
  assert.equal(nflAvailability({ rosterStatus: 'IR', availability: availability(null, true) }, '2026-10-04', '2026-09-30').eligible, true)
})
test('unavailable extremes cannot lead MM highlights', () => {
  const result = teamMmHighlights([{ name: 'Out', mm: 99, eligible: false }, { name: 'Active', mm: 2, eligible: true }])
  assert.equal(result.hidden?.name, 'Active')
})
test('slider retains game availability without changing prices or mutating frames', () => {
  const player: NflOddsPlayer = { id: 1, name: 'Test', team: 'PHI', position: 'WR', markets: [] }
  const frame = { ...EMPTY_SIDELINE_ODDS, players: [player] }
  const current = { ...frame, players: [{ ...player, availability: availability('Out') }] }
  const merged = withGameAvailability(frame, current)
  assert.equal(nflAvailability(merged.players[0]).eligible, false)
  assert.equal(frame.players[0].availability, undefined)
  assert.equal(merged.players[0].markets, player.markets)
})
