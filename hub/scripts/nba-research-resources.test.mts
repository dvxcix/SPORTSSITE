import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { nbaMatrixCandidates } from '../src/lib/nbaMatrix.ts'
import { nbaContextualScore } from '../src/lib/nbaIntelligence.ts'
import { NBA_MARKET_CONTEXT_VERSION } from '../src/lib/nbaMarketSignal.ts'
import * as oddsMode from '../src/lib/nbaOddsMode.ts'

async function compiled(file: string, imports: Record<string, unknown>) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const target = { exports: {} as Record<string, (...args: any[]) => Promise<any>> }
  new Function('require', 'module', 'exports', output)((name: string) => { assert.ok(name in imports, name); return imports[name] }, target, target.exports)
  return target.exports
}
const previous = { id: 5, date: '2026-10-23', season: 2026, status: 'Final', status_state: 'final' }
const board = { game: { id: 9, date: '2026-10-25', season: 2026, datetime: '2026-10-25T23:00:00Z', status: 'Scheduled', home_team: { id: 1 }, visitor_team: { id: 2 } }, sampleSeason: 2026, players: [1, 2].map(id => ({ id, first_name: 'Test', last_name: String(id), team: { id }, logs: [{ player: { id }, team: { id }, game: previous }] })) }

async function fixture() {
  let closed = false, generation = 1, complete = true, reads = 0
  const saved = new Map<string, any>()
  class NbaPregameResearchUnavailable extends Error {}
  const observation = (value: unknown) => ({ value: structuredClone(value), observedAt: `2026-10-24T0${generation}:00:00Z`, source: 'capture', frozen: closed })
  const read = async (_game: unknown, key: string) => saved.has(key) ? { ...structuredClone(saved.get(key)), frozen: closed } : null
  const resources = await compiled('../src/lib/nbaResearchResources.ts', {
    'server-only': {},
    './nbaPregameResearchData': {
      NbaPregameResearchUnavailable, readNbaPregameResearch: read,
      nbaPregameResearch: async (game: unknown, key: string, load: () => Promise<any>) => {
        if (closed) { const prior = await read(game, key); if (!prior) throw new NbaPregameResearchUnavailable(); return prior }
        try { const entry = await load(); saved.set(key, { ...structuredClone(entry), source: 'capture' }); return { ...entry, source: 'capture', frozen: false } }
        catch (error) { const prior = await read(game, key); if (prior) return prior; throw error }
      },
    },
    './nbaIntelligenceData': { getNbaDefenseContext: async () => { reads++; return { ready: complete, profiles: [{ value: generation }], fetchedAt: observation(null).observedAt } } },
    './nbaTrackingData': { getNbaTracking: async () => { reads++; return { rows: [{ value: generation }], complete, fetchedAt: observation(null).observedAt } } },
    './nbaMarketSignalData': { getNbaMarketContext: async () => { reads++; const at = observation(null).observedAt; return { version: NBA_MARKET_CONTEXT_VERSION, gameId: 9, oddsMode: 'pregame', asOf: at, tipAt: board.game.datetime, marketCapturedAt: at, marketObservedAt: at, publicCapturedAt: at, publicObservedAt: at, reason: generation === 1 ? null : 'Pre-tip verification receipt was overwritten', available: generation === 1, signals: generation !== 1 ? [] : [{ playerId: 1, book: 'fanduel', target: { market: 'points', type: 'milestone', line: 30, side: 'over', open: 400, now: 500, changePp: -3, openedAt: '2026-10-23T00:00:00Z' }, related: { market: 'assists', type: 'milestone', line: 4, side: 'over', open: 100, now: -110, changePp: 2, openedAt: '2026-10-23T00:00:00Z' }, targetPicks: 10, relatedPicks: 100, adjustment: 6, opposingPicks: 0, supportingMarkets: 1, attenuation: 1 }] } } },
    './nbaSharedCache': { nbaSharedCache: async (_key: string, _ttl: number, _stale: number, load: () => Promise<unknown>) => ({ value: await load(), fetchedAt: observation(null).observedAt, stale: false }) },
    './supabase/admin': { createAdminClient: () => ({ from: (table: string) => {
      const query: any = { select: () => query, eq: () => query, in: () => query, order: () => query, limit: () => query,
        abortSignal: async () => { reads++; return { error: null, data: table === 'nba_model_reports' ? [{ report: { modelKey: generation, validationThrough: '2026-10-23' } }, { report: { modelKey: 'future', validationThrough: '2026-10-25' } }] : [] } } }
      return query
    } }) },
    './nbaPaintData': {
      getPaintProfile: async (id: number, season: number) => { reads++; return { shooting: complete ? { id, season, value: generation } : null, advanced: complete ? { value: generation } : null } },
      getPaintScouting: async () => { reads++; return {} },
      getPaintGame: async () => { reads++; return previous },
      getPaintFinalStats: async () => { reads++; return { complete: true, rows: [{ game: { id: 5 }, player: { id: 1, first_name: 'Test', last_name: 'One' }, fga: 1 }] } },
    },
    './nbaShotsData': { getNbaPlays: async () => { reads++; return { value: [], stale: false, fetchedAt: observation(null).observedAt } } },
    './nbaShots': { nbaShots: () => [{ value: generation }] },
    './nbaFirstBasket': { nbaOpeningSequence: () => ({ firstFieldGoal: true }), nbaFirstBasketResearch: () => ({ requestedGames: 1, coveredGames: complete ? 1 : 0, rows: [{ value: generation }] }) },
  })
  return { resources, saved, reads: () => reads, close: () => { closed = true }, mutate: (healthy = true) => { generation++; complete = healthy }, resetReads: () => { reads = 0 }, NbaPregameResearchUnavailable }
}

test('defense, tracking, model selection, profiles, first basket and market receipts remain frozen after tip', async () => {
  const h = await fixture(), names = ['Defense', 'Tracking', 'Models', 'Profiles', 'FirstBasket', 'MarketContext']
  const before = new Map<string, any>()
  for (const name of names) before.set(name, await h.resources['getNbaResearch' + name](board, 'pregame'))
  assert.equal(before.get('Profiles').players.length, 2)
  assert.deepEqual(before.get('Models'), [{ modelKey: 1, validationThrough: '2026-10-23' }])
  h.close(); h.mutate(); h.resetReads()
  for (const name of names) {
    const after = await h.resources['getNbaResearch' + name](board, 'pregame'), prior = before.get(name)
    if (prior.researchSnapshot) { assert.equal(after.researchSnapshot.frozen, true); prior.researchSnapshot.frozen = true }
    assert.deepEqual(after, prior, name)
  }
  assert.equal(h.reads(), 0, 'a closed game must never rerun mutable source loaders')
})

test('player profiles follow the actual selected baseline season and retain it after tip', async () => {
  const h = await fixture()
  const mixed = { ...board, players: board.players.map((player, index) => ({ ...player, averageSeason: index === 0 ? 2025 : 2027 })) }
  const pre = await h.resources.getNbaResearchProfiles(mixed, 'pregame')
  assert.deepEqual(pre.players.map((row: { playerId: number; profile: { season: number; shooting: { season: number } } }) => [row.playerId, row.profile.season, row.profile.shooting.season]), [[1, 2025, 2025], [2, 2026, 2026]])
  h.close(); h.mutate(); h.resetReads()
  const after = await h.resources.getNbaResearchProfiles(mixed, 'pregame')
  assert.equal(after.researchSnapshot.frozen, true)
  assert.deepEqual(after.players, pre.players)
  assert.equal(h.reads(), 0, 'a frozen profile never asks a provider for a later season')
})

test('missing historical resources never rebuild; missing models leave estimates unavailable without hiding the board', async () => {
  const h = await fixture(); h.close()
  for (const name of ['Defense', 'Tracking', 'Profiles', 'FirstBasket', 'MarketContext']) await assert.rejects(h.resources['getNbaResearch' + name](board, 'pregame'), h.NbaPregameResearchUnavailable)
  assert.deepEqual(await h.resources.getNbaResearchModels(board, 'pregame'), [])
  assert.equal(h.reads(), 0)
})

test('a later mutable verification receipt cannot remove a frozen market score adjustment', async () => {
  const h = await fixture()
  const quote: any = { game_id: 9, player_id: 1, vendor: 'fanduel', prop_type: 'points', line_value: '30', market: { type: 'milestone', odds: 500 }, updated_at: '2026-10-24T01:00:00Z' }
  const before = await h.resources.getNbaResearchMarketContext(board)
  const score = (context: any) => nbaContextualScore(60, 1, 'points', board.game.date, { offer: quote, side: 'over', context })
  assert.equal(score(before).score, 66); assert.equal(score(before).marketSupport.status, 'confirmed')
  h.close(); h.mutate(); h.resetReads()
  const after = await h.resources.getNbaResearchMarketContext(board)
  assert.deepEqual(score(after), score(before)); assert.equal(h.reads(), 0)
  const changed = await h.resources.getNbaResearchMarketContext(board, 'live')
  assert.equal(score(changed).score, 60, 'fixture proves mutable receipt loss would have changed the score without freezing')
})

test('explicit Live reads updated resources without overwriting saved Pregame inputs', async () => {
  const h = await fixture(), pre = await h.resources.getNbaResearchDefense(board, 'pregame')
  h.close(); h.mutate()
  const live = await h.resources.getNbaResearchDefense(board, 'live')
  assert.equal(live.profiles[0].value, 2); assert.equal(live.researchSnapshot.frozen, false)
  const again = await h.resources.getNbaResearchDefense(board, 'pregame')
  assert.deepEqual(again.profiles, pre.profiles)
})

test('partial pretip refresh cannot overwrite complete archived research or advance its time', async () => {
  const h = await fixture(), names = ['Defense', 'Tracking', 'Profiles', 'FirstBasket']
  const original = new Map<string, any>()
  for (const name of names) original.set(name, await h.resources['getNbaResearch' + name](board))
  h.mutate(false)
  for (const name of names) assert.deepEqual(await h.resources['getNbaResearch' + name](board), original.get(name), name)
})

test('matchup shot samples require the frozen player appearance and never fetch an unrecorded game after tip', async () => {
  const h = await fixture()
  await assert.rejects(h.resources.getNbaResearchShots(board, 9, 1), /outside/)
  await assert.rejects(h.resources.getNbaResearchShots(board, 5, 99), /outside/)
  assert.equal(h.reads(), 0)
  const prior = await h.resources.getNbaResearchShots(board, 5, 1)
  h.close(); h.mutate(); h.resetReads()
  const frozen = await h.resources.getNbaResearchShots(board, 5, 1)
  assert.deepEqual(frozen.shots, prior.shots); assert.equal(h.reads(), 0)
  await assert.rejects(h.resources.getNbaResearchShots(board, 5, 2), h.NbaPregameResearchUnavailable)
  assert.equal(h.reads(), 0)
})

test('resource warming reports deadline deferrals without starting provider jobs', async () => {
  const h = await fixture(), result = await h.resources.warmNbaResearchResources(board, { deadline: Date.now() })
  assert.ok(result.length >= 7); assert.ok(result.every((item: any) => item.status === 'deferred')); assert.equal(h.reads(), 0)
})

test('frozen season matrix statistics retain captured averages instead of switching to the historical log sample', () => {
  const player = { ...board.players[0], props: [], average: { pts: 27 }, logs: [{ ...board.players[0].logs[0], pts: 10, min: '30' }] }
  const frozen: any = { ...board, historical: true, researchSnapshot: { observedAt: '2026-10-24T00:00:00Z', source: 'capture', frozen: true }, players: [player] }
  const factor: any = { id: 'pts', category: 'stats', field: 'points', propType: 'points', window: 'season', location: 'all' }
  assert.equal(nbaMatrixCandidates(frozen)[0].values(factor), 27)
  assert.equal(nbaMatrixCandidates({ ...frozen, researchSnapshot: undefined })[0].values(factor), 10)
})

test('profile endpoint validates the parent game and roster before requesting all frozen profiles', async () => {
  let calls = 0, modeSeen: string | null = null
  const api = await compiled('../src/app/the-paint/profile/route.ts', {
    'next/server': { NextResponse: { json: Response.json } }, '@/lib/paintAccess': { requirePaintAccess: async () => ({ userId: 'member' }) },
    '@/lib/nbaOddsMode': oddsMode,
    '@/lib/nbaPaintData': { getPaintGame: async () => board.game, getPaintBoard: async () => board },
    '@/lib/nbaResearchResources': { getNbaResearchProfiles: async (_board: unknown, mode: string) => { calls++; modeSeen = mode; return { players: [{ playerId: 1, profile: { shooting: { fga: 10 }, advanced: null } }], fetchedAt: 'before-tip' } } },
  })
  const get = async (search: string) => api.GET({ nextUrl: new URL('https://test/profile?' + search) })
  assert.equal((await get('player=1&season=2026')).status, 400)
  assert.equal((await get('game=9&player=99')).status, 404); assert.equal(calls, 0)
  const response = await get('game=9&player=1&season=2030&mode=live'), body = await response.json()
  assert.equal(response.status, 200); assert.equal(body.gameId, 9); assert.equal(body.playerId, 1); assert.equal(modeSeen, 'live'); assert.equal(calls, 1)
})
