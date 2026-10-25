import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as modes from '../src/lib/nbaOddsMode.ts'
import type { PaintBoard } from '../src/lib/nbaPaint.ts'

const tip = Date.parse('2026-10-24T22:00:00Z')
const game = { id: 123, date: '2026-10-24', datetime: new Date(tip).toISOString(), status: 'Scheduled', status_state: 'scheduled', period: 0, home_team: { id: 1 }, visitor_team: { id: 2 } }
function board(frozen = false): PaintBoard {
  return { game, fetchedAt: new Date(tip - (frozen ? 1000 : 60000)).toISOString(), sampleSeason: 2026, statsComplete: true, teams: [], players: [{ id: 7, first_name: 'Test', last_name: 'Player', position: 'G', team: { id: 1, abbreviation: 'BOS' }, average: { pts: frozen ? 7 : 1 }, props: [], logs: [{ pts: frozen ? 7 : 1, game: { date: '2026-10-23', status: 'Final' } }] }], researchSnapshot: { observedAt: new Date(tip - (frozen ? 1000 : 60000)).toISOString(), source: 'capture', frozen } } as unknown as PaintBoard
}
async function compiled(file: string, imports: Record<string, unknown>) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} as Record<string, any> }
  new Function('require', 'exports', 'module', output)((name: string) => { assert.ok(name in imports, name); return imports[name] }, module.exports, module)
  return module.exports
}
async function harness() {
  let now = tip - 1000, canonicalTip = tip, boardReads = 0, clockReads = 0, missing = false
  const initial = board(), final = board(true)
  const clock = async (input: typeof game) => { clockReads++; return { ...input, datetime: new Date(canonicalTip).toISOString() } }
  const getBoard = async () => { boardReads++; if (missing) throw Error('Pregame research snapshot unavailable'); return final }
  const exports = await compiled('../src/lib/nbaResearchBundle.ts', {
    'server-only': {}, './nbaPaintData': { getPaintBoard: getBoard }, './nbaOddsClockData': { getNbaOddsGame: clock },
    './nbaOddsMode': { nbaPregameOpen: (input: typeof game) => modes.nbaPregameOpen(input as any, now) },
  })
  return { initial, final, resolve: exports.resolveNbaResearchBundle as typeof import('../src/lib/nbaResearchBundle.ts').resolveNbaResearchBundle, setTime: (value: number) => { now = value }, setCanonicalTip: (value: number) => { canonicalTip = value }, setMissing: () => { missing = true }, reads: () => ({ boardReads, clockReads }) }
}

test('a slow secondary load crossing tip replaces the entire bundle with final durable values once', async () => {
  const h = await harness(), loads: PaintBoard[] = []
  const result = await h.resolve(h.initial, 'pregame', async board => { loads.push(board); h.setTime(tip); return { baseline: board.players[0].average!.pts, stamp: board.fetchedAt } })
  assert.equal(result.board, h.final)
  assert.deepEqual(result.value, { baseline: 7, stamp: h.final.fetchedAt })
  assert.deepEqual(loads, [h.initial, h.final]); assert.deepEqual(h.reads(), { boardReads: 1, clockReads: 1 })
})

test('open, already frozen, and live bundles do not repeat resource work', async () => {
  for (const kind of ['open', 'frozen', 'live']) {
    const h = await harness(), input = kind === 'frozen' ? h.final : h.initial
    let calls = 0
    const result = await h.resolve(input, kind === 'live' ? 'live' : 'pregame', async () => { calls++; if (kind !== 'open') h.setTime(tip); return 42 })
    assert.equal(result.board, input); assert.equal(result.value, 42); assert.equal(calls, 1)
    assert.equal(h.reads().boardReads, 0); assert.equal(h.reads().clockReads, kind === 'open' ? 1 : 0)
  }
})

test('canonical early closure re-resolves even when the initial scheduled timestamp is still in the future', async () => {
  const h = await harness(); h.setCanonicalTip(tip - 2000)
  assert.equal((await h.resolve(h.initial, 'pregame', async value => value.fetchedAt)).board, h.final)
})

test('missing final research rejects rather than publishing an obsolete earlier pregame bundle', async () => {
  const h = await harness(); h.setMissing()
  await assert.rejects(h.resolve(h.initial, 'pregame', async () => { h.setTime(tip); return 42 }), /snapshot unavailable/)
})

const request = (query: string) => ({ nextUrl: new URL(`https://example.test/?${query}`) })
const basic = { 'next/server': { NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }) } }, '@/lib/paintAccess': { requirePaintAccess: async () => ({ userId: 'owner' }) }, '@/lib/nbaOddsMode': modes }

test('estimate route uses final board logs and the model loaded for that same frozen bundle', async () => {
  const h = await harness(), seen: string[] = []
  const api = await compiled('../src/app/the-paint/estimate/route.ts', {
    ...basic, '@/lib/nbaResearchBundle': { resolveNbaResearchBundle: h.resolve },
    '@/lib/nbaPaintData': { getPaintGame: async () => game, getPaintBoard: async () => h.initial },
    '@/lib/nbaResearchResources': { getNbaResearchModels: async (value: PaintBoard) => { seen.push(value.fetchedAt); h.setTime(tip); return [{ market: 'points', validationThrough: '2026-10-23', marker: value.players[0].average!.pts }] } },
    '@/lib/nbaPaint': { PAINT_MARKETS: [{ key: 'points' }], nbaMarketLogs: (player: any) => player.logs, nbaValue: (log: any) => log.pts, nbaSample: (logs: unknown[]) => logs },
    '@/lib/nbaModel': { nbaValidatedEstimate: (logs: any[], _market: string, _date: string, report: any) => logs[0].pts + report.marker },
  })
  const result = await api.GET(request('game=123&player=7&market=points'))
  assert.equal(result.status, 200); assert.equal(result.body.estimate, 14); assert.equal(result.body.fetchedAt, h.final.fetchedAt)
  assert.deepEqual(seen, [h.initial.fetchedAt, h.final.fetchedAt])
})

test('intelligence route scores and ranks final baseline with final defense and market context', async () => {
  const h = await harness()
  const api = await compiled('../src/app/the-paint/intelligence/route.ts', {
    ...basic, '@/lib/nbaResearchBundle': { resolveNbaResearchBundle: h.resolve },
    '@/lib/nbaPaintData': { getPaintGame: async () => game, getPaintBoard: async () => h.initial },
    '@/lib/nbaMarketSelection': { nbaReadSelection: () => null, nbaSelectedPlayers: (players: unknown) => players },
    '@/lib/nbaResearchResources': {
      getNbaResearchDefense: async (value: PaintBoard) => { h.setTime(tip); return { profiles: [{ teamId: 2, position: 'G', market: 'points', marker: value.players[0].average!.pts }] } },
      getNbaResearchMarketContext: async (value: PaintBoard) => ({ marker: value.players[0].average!.pts }),
    },
    '@/lib/nbaMarketSignal': { nbaEmptyMarketContext: () => ({}), nbaMarketSupportView: (value: unknown) => value, nbaPlayerMarketSignals: () => null },
    '@/lib/nbaIntelligence': { nbaGamePace: () => 100, nbaPosition: () => 'G', nbaSlipSurgeScore: (player: any, _market: string, _date: string, defense: any, _pace: number, context: any) => ({ score: player.average.pts + defense.marker + context.context.marker }) },
    '@/lib/nbaPaint': { PAINT_MARKETS: [{ key: 'points' }], nbaReference: () => ({ odds: 300 }), nbaPeriod: () => 0 },
    '@/lib/nbaMarketMetrics': { nbaMarketRanks: (players: any[]) => new Map([[7, { mm: players[0].average.pts }]]) },
  })
  const result = await api.GET(request('game=123&market=points'))
  assert.equal(result.status, 200); assert.equal(result.body.scores[0].score, 21); assert.equal(result.body.scores[0].mm, 7)
})

test('matrix route re-evaluates final board and every requested resource, retaining owner scope', async () => {
  const h = await harness(), ownership: unknown[] = []
  const factors = ['score', 'tracking', 'picks'].map(category => ({ id: category, category, field: 'value' }))
  const query = { select: () => query, eq: (key: string, value: unknown) => { if (key === 'user_id') ownership.push(value); return query }, order: () => query, then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: [{ id: 'm', name: 'Saved', definition: { factors } }], error: null })) }
  const api = await compiled('../src/app/api/nba-matrices/evaluate/route.ts', {
    ...basic, '@/lib/nbaResearchBundle': { resolveNbaResearchBundle: h.resolve },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => query }) },
    '@/lib/nbaPaintData': { getPaintGame: async () => game, getPaintBoard: async () => h.initial },
    '@/lib/nbaResearchResources': {
      getNbaResearchDefense: async (value: PaintBoard) => { h.setTime(tip); return { profiles: [value.players[0].average!.pts] } },
      getNbaResearchMarketContext: async (value: PaintBoard) => value.players[0].average!.pts,
      getNbaResearchTracking: async (value: PaintBoard) => ({ rows: [value.players[0].average!.pts] }),
    },
    '@/lib/nbaPublicData': { getNbaPublicCaptures: async () => [{ snapshot: { rows: [7] } }] },
    '@/lib/nbaMatrix': { nbaMatrixCandidates: (value: PaintBoard, context: any) => [{ id: '7', values: () => value.players[0].average!.pts! + context.defense[0] + context.market + context.tracking[0] + context.publicPicks[0] }], evaluateNbaMatrix: (_matrix: unknown, candidates: any[]) => new Set(candidates.filter(candidate => candidate.values(factors[0]) === 35).map(candidate => candidate.id)) },
  })
  const result = await api.GET(request('game=123'))
  assert.equal(result.status, 200); assert.deepEqual(result.body.matches[0].playerIds, [7]); assert.equal(result.body.matches[0].readings[0].values[0].value, 35)
  assert.equal(result.body.fetchedAt, h.final.fetchedAt); assert.deepEqual(ownership, ['owner'])
})
