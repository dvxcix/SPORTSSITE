import assert from 'node:assert/strict'
import { test } from 'node:test'
import { archivedScore, archivedTeamGames, verifiedArchivedLines, type ArchivedFinal } from '../src/lib/teamMatchupArchive'

const tip = '2026-11-26T00:30:00Z'
const observed = '2026-11-26T00:29:00Z'
const nba: ArchivedFinal = {
  id: '21718186', date: '2026-11-25', season: 2026, clock: Date.parse(tip),
  away: 'CHI', home: 'NYK', awayScore: 102, homeScore: 121,
}

test('NBA history rejects late and unrelated observations and retains per-book coverage', () => {
  const quote = { vendor: 'FanDuel', game_id: Number(nba.id), updated_at: '2026-11-26T00:28:00Z',
    spread_home_value: '-4.5', spread_away_value: '4.5', total_value: '220.5' }
  const lines = verifiedArchivedLines([
    quote,
    { ...quote, game_id: 89, vendor: 'Other' },
    { ...quote, vendor: 'Later', updated_at: tip },
    { ...quote, vendor: 'Mismatch', spread_away_value: '5.5', total_value: 221 },
  ], nba, 'nba', observed)
  assert.deepEqual(lines.lines, [{ vendor: 'fanduel', spread: -4.5, total: 220.5 },
    { vendor: 'mismatch', spread: null, total: 221 }])
  assert.deepEqual(verifiedArchivedLines([quote], nba, 'nba', tip).lines, [])
})

test('NFL grading uses archived game lines and reverses the spread for the visitor', () => {
  const game = { ...nba, id: '2026_12_KC_BUF', away: 'KC', home: 'BUF', homeScore: 13, awayScore: 10 }
  const quote = { vendor: 'fanduel', updatedAt: observed, spreadHome: -3, spreadAway: 3, total: 45.5 }
  const lines = verifiedArchivedLines([quote, { ...quote, vendor: 'Opening', isOpeningOnly: true },
    { ...quote, vendor: 'Unstamped', updatedAt: null }], game, 'nfl', observed)
  assert.equal(lines.lines.length, 1)
  const archive = new Map([[game.id, lines]])
  assert.deepEqual(archivedTeamGames('KC', [game], archive).games[0].lines, [{ vendor: 'fanduel', spread: 3, total: 45.5 }])
  assert.deepEqual(archivedTeamGames('BUF', [game], archive).games[0].lines, [{ vendor: 'fanduel', spread: -3, total: 45.5 }])
  assert.equal(archivedTeamGames('BUF', [game], new Map()).games[0].lines.length, 0)
  assert.equal(archivedScore(0, 'nfl'), 0)
  assert.equal(archivedScore(0, 'nba'), null)
  assert.equal(archivedScore('24', 'nfl'), null)
})

test('a partial newer quote cannot silently reuse an older line', () => {
  const quote = { vendor: 'fanduel', game_id: Number(nba.id), updated_at: '2026-11-26T00:28:00Z',
    spread_home_value: '-4.5', spread_away_value: '4.5', total_value: '220.5' }
  const data = verifiedArchivedLines([quote, { ...quote, updated_at: observed, spread_away_value: null, total_value: 221 }],
    nba, 'nba', observed)
  assert.deepEqual(data.lines, [{ vendor: 'fanduel', spread: null, total: 221 }])
})
