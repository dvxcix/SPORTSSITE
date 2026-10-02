import assert from 'node:assert/strict'
import test from 'node:test'
import { nflScorerBadge } from '../src/lib/nflScorerBadges'
import type { NflTouchdownEvent } from '../src/lib/nflTouchdownFeed'

const event = (extra: Partial<NflTouchdownEvent> = {}) => ({
  id: 'td-1', gameId: '2026_04_PIT_CLE', team: 'CLE', playerName: 'Kyle Pitts', playerId: '00-1', bdlPlayerId: 1,
  isFirstTdOfGame: true, kind: 'receiving', passerName: 'Deshaun Watson', ...extra,
} as NflTouchdownEvent)
const player = { name: 'Kyle Pitts Sr.', team: 'CLE', id: 1, gsisId: '00-1' }

test('scorer receives flame and game-first medal; passer does not', () => {
  assert.deepEqual(nflScorerBadge([event()], '2026_04_PIT_CLE', player), { count: 1, first: true })
  assert.deepEqual(nflScorerBadge([event()], '2026_04_PIT_CLE', { name: 'Deshaun Watson', team: 'CLE', id: 2 }), { count: 0, first: false })
})
test('game isolation, no future-game or other-team badges', () => {
  assert.deepEqual(nflScorerBadge([event()], '2026_05_PIT_CLE', player), { count: 0, first: false })
  assert.deepEqual(nflScorerBadge([event()], '2026_04_PIT_CLE', { ...player, team: 'PIT' }), { count: 0, first: false })
})
test('deduplicate event receipts and count multiple touchdowns', () => {
  assert.deepEqual(nflScorerBadge([event(), event(), event({ id: 'td-2', isFirstTdOfGame: false })], '2026_04_PIT_CLE', player), { count: 2, first: true })
})
test('name suffix fallback and team aliases without ignoring conflicting IDs', () => {
  const fallback = event({ playerId: null, bdlPlayerId: null, team: 'WAS' })
  assert.deepEqual(nflScorerBadge([fallback], '2026_04_PIT_CLE', { ...player, team: 'WSH' }), { count: 1, first: true })
  assert.deepEqual(nflScorerBadge([event({ playerId: '00-other' })], '2026_04_PIT_CLE', player), { count: 0, first: false })
})
test('return/defensive scorers count; later team-first TD is not game-first', () => {
  assert.deepEqual(nflScorerBadge([event({ kind: 'defense', isFirstTdOfGame: false })], '2026_04_PIT_CLE', player), { count: 1, first: false })
  assert.deepEqual(nflScorerBadge([event({ kind: 'return' })], '2026_04_PIT_CLE', player), { count: 1, first: true })
})
test('removed/corrected events remove badges, empty pregame has no failure marks', () => {
  assert.deepEqual(nflScorerBadge([], '2026_04_PIT_CLE', player), { count: 0, first: false })
})
