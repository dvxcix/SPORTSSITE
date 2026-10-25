import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import * as crypto from 'node:crypto'
import ts from 'typescript'
import * as paint from '../src/lib/nbaPaint.ts'
import * as modes from '../src/lib/nbaOddsMode.ts'
import * as primary from '../src/lib/nbaPrimaryProps.ts'
import { nbaAttachOpenings } from '../src/lib/nbaOddsHistory.ts'
import { nbaMarketRanks } from '../src/lib/nbaMarketMetrics.ts'
import { nbaSelectedPlayers } from '../src/lib/nbaMarketSelection.ts'

const tip = Date.parse('2026-10-24T22:00:00Z')
const team = { id: 4, abbreviation: 'CHA', full_name: 'Charlotte Hornets', name: 'Hornets' }
const game: paint.PaintGame = { id: 21717946, date: '2026-10-24', season: 2026, datetime: new Date(tip).toISOString(), status: 'Scheduled', status_state: 'scheduled', period: 0, home_team: team, visitor_team: { ...team, id: 16, abbreviation: 'MIA' }, home_team_score: 0, visitor_team_score: 0 }
const quotes: paint.PaintProp[] = [1, 2].flatMap(id => ['threes', 'points_1q'].map((market, index) => ({ id: id * 10 + index, player_id: id, game_id: game.id, prop_type: market, vendor: 'fanduel', line_value: '3', market: { type: 'milestone' as const, odds: id === 1 ? -148 : 102 }, updated_at: new Date(tip - 60000).toISOString() })))
function fixtureBoard(): paint.PaintBoard {
  const players: paint.PaintPlayer[] = [1, 2, 3].map(id => {
    const logs: paint.PaintStat[] = Array.from({ length: 10 }, (_, index) => ({ id: id * 100 + index, player: { id }, team: { id: team.id }, game: { id: 1000 + index, date: `2026-10-${String(index + 1).padStart(2, '0')}`, season: 2026, postseason: false, status: 'Final', status_state: 'final', home_team_id: team.id, visitor_team_id: 16 }, min: '25', pts: id * 5, reb: 5, ast: 2, fg3m: id, stl: 0, blk: 0, turnover: 1, fga: 8, fgm: 4, fg3a: 5, fta: 1, ftm: 1 }))
    return { id, first_name: 'Player', last_name: String(id), position: 'F', team, headshot: null, injury: id === 3 ? { status: 'Questionable', description: 'Pretip report' } : null, average: { pts: id * 6, fg3m: id === 1 ? 4 : 3, points_1q: id }, logs, periodLogs: logs.map(log => ({ ...log, id: log.id + 10000, period: 1, pts: id })), props: [] }
  })
  return { game, players, sampleSeason: 2026, baselineSeasons: [2025, 2026], historical: false, sampleEnd: '2026-10-23', fetchedAt: new Date(tip - 3600000).toISOString(), issues: [], statsComplete: true, periodStatsComplete: true, teamStatsSeason: 2025, teamStats: [{ team, season: 2025, stats: { pace: 98 } } as never], starters: [1, 2] }
}
type Snapshot = { value: unknown; observedAt: string; source: 'capture' | 'recovered-cache'; frozen: boolean }
async function harness() {
  let now = tip - 30000, researchReads = 0, phaseReads = 0, wrapperReads = 0
  let onPriceRead: (() => void) | undefined
  const snapshots = new Map<string, Snapshot>(), research = fixtureBoard()
  const scouting = { season: 2026, fetchedAt: research.fetchedAt, players: [{ id: 1, advanced: { usg_pct: .24 }, passing: { passes: 55 } }], issues: [] as string[] }
  class Clock extends Date { constructor(value: string | number = now) { super(value) } static now() { return now } }
  class Missing extends Error { constructor() { super('Pregame research snapshot unavailable') } }
  const imports: Record<string, unknown> = {
    'server-only': {}, 'node:crypto': crypto, '@/lib/balldontlie': { bdlHeaders: {} }, './nbaPaint': { ...paint, nbaToday: () => new Clock().toISOString().slice(0, 10) },
    './nbaOddsMode': { ...modes, nbaPregameOpen: (g: paint.PaintGame) => modes.nbaPregameOpen(g, now), nbaLiveOpen: (g: paint.PaintGame) => modes.nbaLiveOpen(g, now) },
    './nbaOddsClockData': { getNbaOddsGame: async (g: paint.PaintGame) => ({ ...g, ...(now >= tip ? { status: 'Final', status_state: 'final', period: 4, home_team_score: 110 } : {}) }) },
    './nbaOddsHistory': { nbaAttachOpenings }, './nbaOddsHistoryData': { getNbaQuoteOpenings: async () => [] }, './nbaPrimaryProps': primary,
    './nbaFirstBasketOddsData': {}, './nbaBookPropsData': {}, './nbaSupplementalProps': { nbaSupplementalQuote: () => false },
    './nbaOddsPhaseData': { getNbaPhaseSnapshot: async () => { phaseReads++; return { props: quotes, gameOdds: [], firstBasket: [], capturedAt: { props: new Date(tip - 60000).toISOString() } } } },
    './nbaSharedCache': { nbaSharedCache: async (key: string) => {
      if (key.startsWith('board:')) { researchReads++; return { value: structuredClone(research), fetchedAt: research.fetchedAt, stale: false } }
      if (key.startsWith('scouting:')) { researchReads++; return { value: structuredClone(scouting), fetchedAt: scouting.fetchedAt, stale: false } }
      assert.ok(key.startsWith('phase-prices:'), key)
      onPriceRead?.()
      return { value: { props: quotes, gameOdds: [], firstBasket: [], observedAt: new Date(tip - 60000).toISOString(), issues: [] }, fetchedAt: new Clock().toISOString(), stale: false }
    } },
    './nbaPregameResearchData': { readNbaPregameResearch: async (_g: paint.PaintGame, resource: string) => structuredClone(snapshots.get(resource) ?? null), nbaPregameResearch: async (_g: paint.PaintGame, resource: string, load: () => Promise<{ value: unknown; observedAt: string }>) => {
      wrapperReads++
      if (now < tip) { const current = await load(); snapshots.set(resource, { ...structuredClone(current), source: 'capture', frozen: false }) }
      const saved = snapshots.get(resource)
      if (!saved) throw new Missing()
      return { ...structuredClone(saved), frozen: now >= tip }
    } },
  }
  const source = await readFile(new URL('../src/lib/nbaPaintData.ts', import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'Date', 'fetch', output)((name: string) => { assert.ok(name in imports, name); return imports[name] }, module, module.exports, Clock, () => { throw Error('Unexpected provider fetch') })
  return { api: module.exports as typeof import('../src/lib/nbaPaintData.ts'), research, scouting, snapshots, setTime: (value: number) => { now = value }, onPriceRead: (callback: () => void) => { onPriceRead = callback }, metrics: () => ({ researchReads, phaseReads, wrapperReads }) }
}

test('pregame board keeps roster, season baseline, full-game and Q1 MM through tip and the next date', async () => {
  const h = await harness(), pre = await h.api.getPaintBoard(game)
  const ranks = (board: paint.PaintBoard, market: paint.PaintMarket) => [...nbaMarketRanks(nbaSelectedPlayers(board.players, market, { type: 'milestone', line: 3 }), market, 'fanduel', 'all', { gameId: game.id, beforeDate: game.date })]
  const before = ['threes', 'points_1q'].map(market => ranks(pre, market as paint.PaintMarket))
  h.research.players = h.research.players.slice(0, 1)
  h.research.players[0].average = { fg3m: 1.448, points_1q: 9 }
  h.research.players[0].logs = []
  h.research.statsComplete = false
  for (const at of [tip, tip + 86400000]) {
    h.setTime(at)
    const frozen = await h.api.getPaintBoard(game)
    assert.deepEqual(frozen.players, pre.players)
    assert.deepEqual(['threes', 'points_1q'].map(market => ranks(frozen, market as paint.PaintMarket)), before)
    assert.equal(frozen.statsComplete, true)
    assert.equal(frozen.periodStatsComplete, true)
    assert.equal(frozen.historical, true)
    assert.equal(frozen.fetchedAt, pre.fetchedAt)
    assert.equal(frozen.game.status_state, 'final')
    assert.deepEqual((frozen as paint.PaintBoard & { researchSnapshot: unknown }).researchSnapshot, { observedAt: pre.fetchedAt, source: 'capture', frozen: true })
  }
  assert.equal(h.metrics().researchReads, 1, 'closed research never reloads final rosters or current averages')
  assert.equal(h.metrics().phaseReads, 2, 'each closed response attaches only the existing pregame quote snapshot')
})

test('missing closed research fails before provider, cache or quote refresh work', async () => {
  const h = await harness(); h.setTime(tip)
  await assert.rejects(h.api.getPaintBoard(game), /Pregame research snapshot unavailable/)
  await assert.rejects(h.api.getPaintScouting(game), /Pregame research snapshot unavailable/)
  assert.deepEqual(h.metrics(), { researchReads: 0, phaseReads: 0, wrapperReads: 2 })
})

test('recovered pretip board preserves original observation and incomplete-quarter coverage honestly', async () => {
  const h = await harness(); h.setTime(tip + 10000)
  const saved = { ...fixtureBoard(), periodStatsComplete: false, issues: ['First-quarter sample incomplete'] }
  h.snapshots.set('board:v1', { value: saved, observedAt: saved.fetchedAt, source: 'recovered-cache', frozen: true })
  const result = await h.api.getPaintBoard(game)
  assert.equal(result.periodStatsComplete, false)
  assert.deepEqual(result.issues, saved.issues)
  assert.equal(result.fetchedAt, saved.fetchedAt)
  assert.equal((result as paint.PaintBoard & { researchSnapshot: { source: string } }).researchSnapshot.source, 'recovered-cache')
  assert.equal(h.metrics().researchReads, 0)
})

test('scouting is archived before tip and returns those same profiles after tip', async () => {
  const h = await harness(), pre = await h.api.getPaintScouting(game)
  h.scouting.players[0].advanced.usg_pct = .99
  h.setTime(tip + 86400000)
  const frozen = await h.api.getPaintScouting(game)
  assert.deepEqual(frozen, { ...pre, researchSnapshot: { ...pre.researchSnapshot, frozen: true } })
  assert.equal(h.metrics().researchReads, 1)
})

test('a degraded full-game or Q1 refresh preserves the previous board as one original-time bundle', async () => {
  for (const coverage of ['statsComplete', 'periodStatsComplete'] as const) {
    const h = await harness(), pre = await h.api.getPaintBoard(game)
    h.research[coverage] = false
    h.research.fetchedAt = new Date(tip - 1000).toISOString()
    h.research.players = h.research.players.slice(0, 1)
    h.research.players[0].average = { fg3m: 99 }
    h.setTime(tip - 500)
    const retained = await h.api.getPaintBoard(game)
    assert.deepEqual(retained.players, pre.players)
    assert.equal(retained.statsComplete, true)
    assert.equal(retained.periodStatsComplete, true)
    assert.equal(retained.fetchedAt, pre.fetchedAt)
    assert.equal(h.snapshots.get('board:v1')?.observedAt, pre.fetchedAt)
  }
})

test('first partial board remains honest and a subsequent complete observation can replace it', async () => {
  const h = await harness()
  h.research.statsComplete = false
  h.research.periodStatsComplete = false
  const partial = await h.api.getPaintBoard(game)
  assert.equal(partial.statsComplete, false)
  assert.equal(partial.periodStatsComplete, false)
  h.research.statsComplete = true
  h.research.periodStatsComplete = true
  h.research.fetchedAt = new Date(tip - 1000).toISOString()
  h.setTime(tip - 500)
  const complete = await h.api.getPaintBoard(game)
  assert.equal(complete.statsComplete, true)
  assert.equal(complete.periodStatsComplete, true)
  assert.equal(complete.fetchedAt, h.research.fetchedAt)
})

test('missing roster or season-average feed cannot silently replace a complete baseline even when log pages succeed', async () => {
  for (const issue of ['Roster coverage incomplete', 'Season averages unavailable', 'Prior-season averages unavailable']) {
    const h = await harness(), pre = await h.api.getPaintBoard(game)
    h.research.issues.push(issue)
    h.research.players[0].average = { fg3m: 1.448 }
    h.research.fetchedAt = new Date(tip - 1000).toISOString()
    h.setTime(tip - 500)
    const retained = await h.api.getPaintBoard(game)
    assert.deepEqual(retained.players, pre.players)
    assert.equal(retained.fetchedAt, pre.fetchedAt)
  }
})

test('scouting feed or roster errors preserve the previous complete bundle and observation time', async () => {
  for (const issue of ['passing sample unavailable', 'Roster coverage incomplete']) {
    const h = await harness(), pre = await h.api.getPaintScouting(game)
    h.scouting.issues.push(issue)
    h.scouting.players[0].advanced.usg_pct = .99
    h.scouting.fetchedAt = new Date(tip - 1000).toISOString()
    h.setTime(tip - 500)
    assert.deepEqual(await h.api.getPaintScouting(game), pre)
  }
})

test('first partial scouting is retained honestly when no complete snapshot exists', async () => {
  const h = await harness()
  h.scouting.issues.push('passing sample unavailable')
  const partial = await h.api.getPaintScouting(game)
  assert.deepEqual(partial.issues, ['passing sample unavailable'])
  assert.equal(partial.fetchedAt, h.scouting.fetchedAt)
})

test('explicit live board bypasses the pregame research archive', async () => {
  const h = await harness(); h.setTime(tip + 10000)
  const live = await h.api.getPaintBoard(game, 'live')
  assert.equal(live.oddsMode, 'live')
  assert.equal(h.metrics().wrapperReads, 0)
  assert.equal(h.metrics().researchReads, 1)
  assert.equal(h.metrics().phaseReads, 1)
})

test('a price read crossing tip returns the final durable research winner instead of the earlier board', async () => {
  const h = await harness(), winner = fixtureBoard()
  winner.players[0].average.fg3m = 7
  winner.fetchedAt = new Date(tip - 1000).toISOString()
  h.onPriceRead(() => {
    h.snapshots.set('board:v1', { value: winner, observedAt: winner.fetchedAt, source: 'capture', frozen: true })
    h.setTime(tip)
  })
  const result = await h.api.getPaintBoard(game)
  assert.equal(result.players[0].average.fg3m, 7)
  assert.equal(result.fetchedAt, winner.fetchedAt)
  assert.equal(result.historical, true)
  assert.equal(result.researchSnapshot?.frozen, true)
  assert.equal(h.metrics().researchReads, 1, 'closed resolution never loads current stats')
  assert.equal(h.metrics().wrapperReads, 2)
})
