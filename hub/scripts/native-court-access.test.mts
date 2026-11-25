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
  '@/lib/nflAccess': 'export async function requireNflAccess() { return globalThis.nativeCourtFixture.readerStatus === 403 ? { error: new Response(null, {status: 403}) } : {} }',
  '@/app/the-sideline/data': 'export async function getSidelineGames() { const fixture = globalThis.nativeCourtFixture; if (!fixture.schedule) throw new Error("Schedule unavailable"); return fixture.schedule }',
}
const bundle = await build({
  stdin: {
    contents: `
      export { GET as board } from './src/app/api/mobile/court/board/route'
      export { GET as schedule } from './src/app/api/mobile/court/schedule/route'
      export { GET as oddsBoard } from './src/app/api/mobile/court/odds-board/route'
      export { GET as sidelineMarket } from './src/app/api/mobile/sideline/market/route'
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
const moduleFixture = { exports: {} as Record<'board' | 'schedule' | 'oddsBoard' | 'sidelineMarket' | 'sidelineSchedule', Handler> }
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
