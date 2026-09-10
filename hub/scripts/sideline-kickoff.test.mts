import assert from 'node:assert/strict'
import test from 'node:test'
import { nflKickoffAt, sidelinePregameCutoff } from '../src/app/the-sideline/kickoff.ts'

test('NFL kickoff resolves Eastern daylight and standard time correctly', () => {
  assert.equal(nflKickoffAt({ gameday: '2026-09-10', gametime: '20:15' })?.toISOString(), '2026-09-11T00:15:00.000Z')
  assert.equal(nflKickoffAt({ gameday: '2026-12-10', gametime: '20:15' })?.toISOString(), '2026-12-11T01:15:00.000Z')
})

test('pregame cutoff only freezes a board once kickoff is reached', () => {
  const game = { gameday: '2026-09-10', gametime: '20:15' }
  assert.equal(sidelinePregameCutoff(game, new Date('2026-09-11T00:14:59.000Z')), null)
  assert.equal(sidelinePregameCutoff(game, new Date('2026-09-11T00:15:00.000Z')), '2026-09-11T00:15:00.000Z')
})
