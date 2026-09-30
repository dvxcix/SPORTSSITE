import test from 'node:test'
import assert from 'node:assert/strict'
import { finalPitchGamesForDate, latestPitchLogDate } from '../src/lib/pitchPipelineHealth.ts'
import { isCompetitiveMlbGame, SAVANT_COMPETITIVE_GAME_FILTER } from '../src/lib/mlbCompetitiveGames.ts'

test('ingestion and health coverage include every postseason round, not exhibitions', () => {
  const types = ['R', 'F', 'D', 'L', 'W', 'S', 'E', 'A']
  assert.deepEqual(types.filter(isCompetitiveMlbGame), ['R', 'F', 'D', 'L', 'W'])
  assert.equal(decodeURIComponent(SAVANT_COMPETITIVE_GAME_FILTER), 'R|F|D|L|W|')
  assert.deepEqual(finalPitchGamesForDate(types.map((gameType, gamePk) => ({ gamePk, gameType, officialDate: '2026-09-29', status: { abstractGameState: 'Final' } })), '2026-09-29'), [0, 1, 2, 3, 4])
})

test('cancelled games are not played finals', () => {
  assert.deepEqual(finalPitchGamesForDate([
    { gamePk: 823490, officialDate: '2026-09-27', gameType: 'R', status: { abstractGameState: 'Final', codedGameState: 'C', detailedState: 'Cancelled: Rain' } },
  ], '2026-09-27'), [])
})

test('audit excludes cross-date finals, includes late UTC games and deduplicates', () => {
  const games = [
    { gamePk: 1, officialDate: '2026-09-22', status: { abstractGameState: 'Final' } },
    { gamePk: 1, officialDate: '2026-09-22', status: { abstractGameState: 'Final' } },
    { gamePk: 824785, officialDate: '2026-09-23', status: { abstractGameState: 'Final' } },
    { gamePk: 2, officialDate: '2026-09-22', status: { abstractGameState: 'Preview' } },
    { gamePk: 3, officialDate: '2026-09-22', gameType: 'S', status: { abstractGameState: 'Final' } },
  ]
  assert.deepEqual(finalPitchGamesForDate(games, '2026-09-22'), [1])
})
function client(responses: any[]) {
  let calls = 0
  const chain: any = { select: () => chain, eq: () => chain, order: () => chain, limit: async () => responses[Math.min(calls++, responses.length - 1)] }
  return { db: { from: () => chain } as any, calls: () => calls }
}
test('transient freshness timeout retries rather than claiming data absent', async () => {
  const c = client([{ error: { code: '57014' }, data: null }, { error: null, data: [{ game_date: '2026-09-22' }] }])
  assert.equal(await latestPitchLogDate(c.db, 2026), '2026-09-22')
  assert.equal(c.calls(), 2)
})
test('persistent timeout throws; genuine successful empty read returns null', async () => {
  const c = client([{ error: { code: '57014' }, data: null }])
  await assert.rejects(latestPitchLogDate(c.db, 2026))
  assert.equal(c.calls(), 3)
  assert.equal(await latestPitchLogDate(client([{ data: [], error: null }]).db, 2026), null)
})
