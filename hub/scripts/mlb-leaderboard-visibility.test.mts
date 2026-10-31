import assert from 'node:assert/strict'
import test from 'node:test'
import { filterLeaderboardSports } from '../src/lib/mlbLeaderboardVisibility.ts'

const users = [{ id: 'one', wins: 12, losses: 3, bySport: { MLB: { wins: 5 }, nfl: { wins: 7 } } }, { id: 'two', wins: 3, losses: 1, bySport: { mlb: { wins: 3 }, NBA: { wins: 0 } } }]
const sports = ['MLB', 'nfl', 'mlb', 'NBA']

test('members cannot see MLB sport breakdowns while ranking and stored source remain intact', () => {
  const result = filterLeaderboardSports(users, sports, false)
  assert.deepEqual(result.allSports, ['nfl', 'NBA'])
  assert.deepEqual(result.users.map(user => [user.id, user.wins, user.losses]), [['one', 12, 3], ['two', 3, 1]])
  assert.deepEqual(result.users.map(user => Object.keys(user.bySport)), [['nfl'], ['NBA']])
  assert.ok('MLB' in users[0].bySport)
  assert.ok('mlb' in users[1].bySport)
})

test('admins retain the existing full leaderboard', () => {
  const result = filterLeaderboardSports(users, sports, true)
  assert.equal(result.users, users)
  assert.equal(result.allSports, sports)
})
