import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const stubs: Record<string, string> = {
  'server-only': '',
  '@/lib/requireTier': `
    export async function resolveAuthedClient() {
      const fixture = globalThis.nativeCourtFixture
      return {
        userId: fixture.userId,
        supabase: { auth: { mfa: { getAuthenticatorAssuranceLevel: async token => {
          if (token !== 'fixture-token') throw new Error('Unexpected token')
          return { data: fixture.assurance, error: fixture.error }
        } } } }
      }
    }`,
  './ownOnboarding': 'export async function ownOnboardingComplete() { return globalThis.nativeCourtFixture.onboarded }',
  '@/app/the-paint/board/route': 'export async function GET(request) { return Response.json({ reader: "board", query: request.nextUrl.search, token: request.headers.get("authorization") }, { status: globalThis.nativeCourtFixture.readerStatus }) }',
  '@/app/the-paint/schedule/route': 'export async function GET(request) { return Response.json({ reader: "schedule", query: request.nextUrl.search, token: request.headers.get("authorization") }, { status: globalThis.nativeCourtFixture.readerStatus }) }',
  '@/app/the-paint/odds-board/route': 'export async function GET(request) { return Response.json({ reader: "oddsBoard", query: request.nextUrl.search, token: request.headers.get("authorization") }, { status: globalThis.nativeCourtFixture.readerStatus }) }',
  '@/app/the-sideline/market/route': 'export async function GET(request) { return Response.json({ reader: "sidelineMarket", query: new URL(request.url).search, token: request.headers.get("authorization") }, { status: globalThis.nativeCourtFixture.readerStatus }) }',
  '@/app/the-paint/first-basket/route': 'export async function GET(request) { return Response.json({ reader: "firstBasket", query: request.nextUrl.search, token: request.headers.get("authorization") }, { status: globalThis.nativeCourtFixture.readerStatus }) }',
  '@/app/the-paint/first-basket/odds/route': 'export async function GET(request) { return Response.json({ reader: "firstBasketOdds", query: request.nextUrl.search, token: request.headers.get("authorization") }, { status: globalThis.nativeCourtFixture.readerStatus }) }',
  '@/app/the-paint/slate/route': 'export async function GET(request) { return Response.json({ reader: "courtSlateEdge", query: request.nextUrl.search, token: request.headers.get("authorization") }, { status: globalThis.nativeCourtFixture.readerStatus }) }',
  '@/app/api/the-sideline/slate-edge/route': 'export async function GET(request) { return Response.json({ reader: "sidelineSlateEdge", query: request.nextUrl.search, token: request.headers.get("authorization") }, { status: globalThis.nativeCourtFixture.readerStatus }) }',
  '@/app/the-paint/intelligence/route': 'export async function GET() { return Response.json({reader: "intelligence"}) }',
  '@/app/the-paint/lineups/route': 'export async function GET() { return Response.json({reader: "lineups"}) }',
  '@/app/the-paint/divergence/route': 'export async function GET() { return Response.json({reader: "divergence"}) }',
  '@/app/the-paint/public/route': 'export async function GET() { return Response.json({reader: "public"}) }',
  '@/app/the-paint/results/route': 'export async function GET() { return Response.json({reader: "results"}) }',
  '@/app/the-paint/estimate/route': 'export async function GET() { return Response.json({reader: "estimate"}) }',
  '@/lib/nativeCourtCheatsheets': 'export async function getNativeCourtCheatsheets(request) { return Response.json({ reader: "courtCheatsheets", query: request.nextUrl.search, token: request.headers.get("authorization") }, { status: globalThis.nativeCourtFixture.readerStatus }) }',
  '@/lib/nflPregameResearchData': 'export function nflPregameOpen() { return Boolean(globalThis.nativeCourtFixture.phases?.shift()) }',
  '@/lib/nativeNflResearch': 'export function nativeNflCheatsheets() { return {rows: []} } export function nativeNflMismatch(game, lens, window, board) { return {rows: [lens.windows[window], board.capturedAt]} } export function nativeNflLadders(game, board, rows, market, book, kind, side) { return {rows, kind, side} }',
  '@/lib/nflMatrixData': 'export async function loadNflMatrices(userId) { if (userId !== globalThis.nativeCourtFixture.userId) throw new Error("Wrong Matrix owner"); return {data: []} }',
  '@/lib/nflAccess': 'export async function requireNflAccess() { const fixture = globalThis.nativeCourtFixture; return fixture.readerStatus === 403 ? { error: new Response(null, {status: 403}) } : { userId: fixture.nflUserId ?? fixture.userId } }',
  '@/app/the-sideline/data': `export async function getSidelineGames() { const fixture = globalThis.nativeCourtFixture; if (!fixture.schedule) throw new Error("Schedule unavailable"); return fixture.schedule }
    export async function getSidelineOddsBundle() { const fixture = globalThis.nativeCourtFixture; return { odds: { players: [], capturedAt: fixture.captures?.shift() } } }
    export async function getCachedSidelineBoardLens() { return { status: "calculated", windows: { season: "season", l5: "l5" } } }
    export async function getCachedSidelineCheatsheetLens() { return { status: "calculated" } }
  `,
}
const bundle = await build({
  stdin: {
    contents: `
      export { GET as board } from './src/app/api/mobile/court/board/route'
      export { GET as schedule } from './src/app/api/mobile/court/schedule/route'
      export { GET as oddsBoard } from './src/app/api/mobile/court/odds-board/route'
      export { GET as sidelineMarket } from './src/app/api/mobile/sideline/market/route'
      export { GET as courtTools } from './src/app/api/mobile/court/tools/route'
      export { GET as sidelineResearch } from './src/app/api/mobile/sideline/research/route'
      export { GET as sidelineSchedule } from './src/app/api/mobile/sideline/schedule/route'
    `,
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, write: false, format: 'cjs', platform: 'node', tsconfig: 'tsconfig.json',
  external: ['next/server'],
  plugins: [{ name: 'native-read-auth-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'js' }))
  } }],
})
type Handler = typeof import('../src/app/api/mobile/court/board/route').GET
const moduleFixture = { exports: {} as Record<'board' | 'schedule' | 'oddsBoard' | 'sidelineMarket' | 'sidelineSchedule' | 'courtTools' | 'sidelineResearch', Handler> }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, moduleFixture, moduleFixture.exports)
const { NextRequest } = require('next/server')

test('native research reads require a verified account, current MFA and onboarding before delegating to the protected reader', async () => {
  const ready = { userId: 'member', assurance: { currentLevel: 'aal2', nextLevel: 'aal2' }, onboarded: true, readerStatus: 200 }
  for (const resource of ['board', 'schedule', 'oddsBoard', 'sidelineMarket'] as const) {
    const set = (fixture: object) => Object.assign(globalThis, { nativeCourtFixture: { ...ready, ...fixture } })
    const request = (bearer = true) => moduleFixture.exports[resource](new NextRequest(
      'https://slipsurge.invalid/api/mobile/court/' + resource + '?game=310&date=2026-11-24',
      { headers: bearer ? { authorization: 'Bearer fixture-token' } : {} },
    ))
    set({})
    assert.equal((await request(false)).status, 401)
    set({ userId: null })
    assert.equal((await request()).status, 401)
    set({ assurance: { currentLevel: 'aal1', nextLevel: 'aal2' } })
    let response = await request()
    assert.equal(response.status, 403)
    assert.equal((await response.json()).code, 'MFA_REQUIRED')
    set({ onboarded: false })
    response = await request()
    assert.equal(response.status, 403)
    assert.equal((await response.json()).code, 'ONBOARDING_REQUIRED')
    set({ assurance: null, error: new Error('service unavailable') })
    response = await request()
    assert.equal(response.status, 503)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    set({ readerStatus: 403 })
    assert.equal((await request()).status, 403, 'the existing tier denial remains authoritative')
    set({})
    assert.deepEqual(await (await request()).json(), { reader: resource, query: '?game=310&date=2026-11-24', token: 'Bearer fixture-token' })
  }
})

test('native Sideline schedule keeps its exact date and requires entitlement before reading', async () => {
  const date = '2026-11-26'
  const fixture = {
    userId: 'member', assurance: { currentLevel: 'aal2', nextLevel: 'aal2' }, onboarded: true, readerStatus: 200,
    schedule: {
      date, games: [{
        id: 'matchup', gameday: date, gametime: '13:00', homeScore: 42,
        away: { abbr: 'DAL', name: 'Cowboys', logo: null, color: '#002244' },
        home: { abbr: 'PHI', name: 'Eagles', logo: null, color: '#004953' },
      }],
    },
  }
  const set = (changes: object = {}) => Object.assign(globalThis, { nativeCourtFixture: { ...fixture, ...changes } })
  const request = (selected?: string, bearer = true) => moduleFixture.exports.sidelineSchedule(new NextRequest(
    'https://slipsurge.invalid/api/mobile/sideline/schedule' + (selected === undefined ? '' : `?date=${selected}`),
    { headers: bearer ? { authorization: 'Bearer fixture-token' } : {} },
  ))
  set()
  assert.equal((await request(date, false)).status, 401)
  set({ onboarded: false })
  assert.equal((await request(date)).status, 403)
  set({ readerStatus: 403, schedule: null })
  assert.equal((await request(date)).status, 403)
  set()
  assert.equal((await request('2026-02-31')).status, 400)
  assert.deepEqual(await (await request('2026-11-25')).json(), { date: '2026-11-25', games: [] })
  const current = await request()
  assert.equal(current.headers.get('cache-control'), 'private, no-store')
  const slate = await current.json()
  assert.equal(slate.date, date)
  assert.equal(slate.games[0].kickoff, '2026-11-26T18:00:00.000Z')
  assert.equal('homeScore' in slate.games[0], false)
  assert.deepEqual(await (await request(date)).json(), slate)
  set({ schedule: null })
  assert.equal((await request(date)).status, 503)
})

test('research tools keep native auth, canonical readers, date scope and kickoff revalidation', async () => {
  const date = '2026-11-26'
  const fixture = {
    userId: 'member', assurance: { currentLevel: 'aal2', nextLevel: 'aal2' }, onboarded: true, readerStatus: 200,
    schedule: { date, games: [{ id: 'nfl-match', season: 2026, week: 12, gameType: 'REG', gameday: date }] },
  }
  const set = (changes: object = {}) => Object.assign(globalThis, { nativeCourtFixture: { ...fixture, ...changes } })
  const request = (key: 'courtTools' | 'sidelineResearch', query: string, bearer = true) =>
    moduleFixture.exports[key](new NextRequest('https://slipsurge.invalid/api/mobile/' + key + '?' + query,
      { headers: bearer ? { authorization: 'Bearer fixture-token' } : {} }))

  const court = { 'first-basket': 'firstBasket', 'first-basket-odds': 'firstBasketOdds', 'slate-edge': 'courtSlateEdge', cheatsheets: 'courtCheatsheets' }
  for (const [tool, reader] of Object.entries(court)) {
    const query = 'tool=' + tool + '&date=' + date + '&game=310'
    set()
    assert.equal((await request('courtTools', query, false)).status, 401)
    set({ readerStatus: 403 })
    assert.equal((await request('courtTools', query)).status, 403)
    set()
    assert.deepEqual(await (await request('courtTools', query)).json(), { reader, query: '?' + query, token: 'Bearer fixture-token' })
  }
  assert.equal((await request('courtTools', 'tool=unscoped')).status, 400)
  assert.equal((await request('sidelineResearch', 'tool=slate-edge&date=2026-02-30')).status, 400)
  const slate = 'tool=slate-edge&date=' + date
  assert.equal((await request('sidelineResearch', slate, false)).status, 401)
  assert.equal((await (await request('sidelineResearch', slate)).json()).reader, 'sidelineSlateEdge')
  const mm = 'tool=mm&game=nfl-match&window=l5&date='
  assert.equal((await request('sidelineResearch', mm + '2026-11-25')).status, 404)
  set({ readerStatus: 403 })
  assert.equal((await request('sidelineResearch', mm + date)).status, 403)
  set({ nflUserId: 'different-member' })
  assert.equal((await request('sidelineResearch', mm + date)).status, 403)
  set({ phases: [true, false], captures: ['in-flight', 'frozen'] })
  const response = await request('sidelineResearch', mm + date)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual((await response.json()).rows, ['l5', 'frozen'])
  const ladders = 'tool=ladders&game=nfl-match&date=' + date
  assert.equal((await request('sidelineResearch', ladders + '&kind=milestone&side=under')).status, 400)
  set({ phases: [true, false], captures: ['in-flight', 'frozen'] })
  const ladderResponse = await (await request('sidelineResearch', ladders + '&kind=over_under&side=under')).json()
  assert.deepEqual(ladderResponse.rows, ['season', 'frozen'])
  assert.equal(ladderResponse.side, 'under')
})
