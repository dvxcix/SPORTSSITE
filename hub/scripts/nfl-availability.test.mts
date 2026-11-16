import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterNflRosterMarkets, nflAvailability, nflRosterMarketExclusions, withGameAvailability } from '../src/lib/nflAvailability'
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
test('a cut player stays ineligible even if a price or an old active designation is present', () => {
  for (const rosterStatus of ['CUT', 'RLS', 'Waived', 'Released']) {
    const player = { rosterStatus, availability: availability(null, true) }
    assert.equal(nflAvailability(player, '2026-11-16', '2026-11-16').eligible, false)
    assert.equal(nflAvailability(player, '2026-10-16', '2026-11-16').eligible, true)
  }
})
test('roster eligibility removes sidecar prices and checks team aliases, season and game elevations', () => {
  const released: NflOddsPlayer = { id: 1, name: 'Hayden Rucci', team: 'LAC', position: 'TE', gsisId: '00-0039489', latestTeam: 'LAC', lastSeason: 2026, rosterStatus: 'CUT', markets: [] }
  const elsewhere = { ...released, id: 2, name: 'Traded player', latestTeam: 'BAL', rosterStatus: 'ACT' }
  const alias = { ...released, id: 3, name: 'Rams receiver', team: 'LAR', latestTeam: 'LA', rosterStatus: 'ACT' }
  const historical = { ...released, id: 4, name: 'Earlier season', lastSeason: 2027 }
  const elevated = { ...released, id: 5, name: 'Elevated player', rosterStatus: 'DEV', availability: availability(null, true) }
  const practice = { ...released, id: 6, name: 'Practice player', rosterStatus: 'DEV' }
  const prices = [released, elsewhere, alias].map(player => ({
    playerId: player.id, name: player.name, team: player.team, label: 'Anytime TD', propType: 'anytime_td',
    offer: { vendor: 'fanduel', type: 'milestone' as const, line: 0.5, openingLine: 0.5, current: { odds: 1900 }, opening: null, updatedAt: null },
  }))
  const board = { ...EMPTY_SIDELINE_ODDS, players: [released, elsewhere, alias, historical, elevated, practice], lastSeen: { offers: prices, lines: [] }, openingOnly: { offers: prices, lines: [] } }
  const visible = filterNflRosterMarkets(board, nflRosterMarketExclusions(board.players, 2026))
  assert.deepEqual(visible.players.map(player => player.id), [3, 4, 5])
  assert.deepEqual(visible.lastSeen?.offers.map(quote => quote.playerId), [3])
  assert.deepEqual(visible.openingOnly?.offers.map(quote => quote.playerId), [3])
  assert.equal(board.lastSeen.offers.length, 3)
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
