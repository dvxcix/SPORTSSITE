import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../package.json', import.meta.url))
const ts = require('typescript')

async function capture(scenario) {
  let reloads = 0, finds = 0, captures = 0, closed = 0, released = 0, extraTime = 0
  const start = Date.now()
  class Clock extends Date { static now() { return start + extraTime } }
  const upcoming = new Date(start + 6 * 3600000)
  const game = { id: 123, date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(upcoming), datetime: upcoming.toISOString(), status_state: 'scheduled', visitor_team: { full_name: 'Boston Celtics' }, home_team: { full_name: 'Detroit Pistons' } }
  const scrape = () => {}, locator = { filter: () => locator, first: () => locator, click: async () => {}, waitFor: async () => {} }
  const path = () => scenario === 'login-redirect' || scenario === 'reload-login' && reloads ? '/login' : scenario === 'other-path' ? '/leagues/mlb' : '/leagues/nba'
  const browser = { page: {
    setDefaultTimeout() {}, setDefaultNavigationTimeout() {}, goto: async () => {}, url: () => 'https://app.pikkit.com' + path(),
    waitForTimeout: async () => {}, waitForFunction: async () => {}, getByText: () => locator,
    reload: async options => { assert.deepEqual(options, { waitUntil: 'domcontentloaded', timeout: 20000 }); reloads++; if (scenario === 'reload-timeout') return new Promise(() => {}) },
    evaluate: async (fn, arg) => {
      if (fn === scrape) return { complete: true, props: {} }
      if (fn.toString().includes('querySelectorAll') && arg === undefined) {
        // Execute the actual browser predicate against a minimal DOM fixture.
        const document = { body: { innerText: scenario === 'sign-in-text' ? 'Please sign in to continue' : scenario === 'long-shell' ? 'Loading '.repeat(60) : 'NBA navigation shell' }, querySelectorAll: selector => selector === 'select' && scenario === 'market-controls' ? [{}] : selector.startsWith('a[') && scenario === 'populated-schedule' ? [{}] : [] }
        return new Function('document', 'location', `return (${fn.toString()})()`)(document, { pathname: path() })
      }
      if (arg !== undefined) return { path: path(), bodyLength: 194, events: [], signIn: false }
      return 'Boston Celtics Detroit Pistons 10/20'
    },
  }, close: async () => { closed++ } }
  const query = { select() { return this }, in() { return this }, order() { return this }, limit: async () => ({ data: [], error: null }) }
  const mocks = {
    'next/server': { NextResponse: { json: Response.json } }, '@/lib/cron-auth': { requireBrowserbaseCronAuth: () => null }, '@/lib/pipelineHealth': { withPipelineHealth: (_name, run) => run },
    '@/lib/nbaPaintData': { getPaintSchedule: async () => ({ games: [game] }) }, '@/lib/nbaPaint': { nbaToday: () => game.date }, '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => query }) },
    '@/lib/pikkitBrowserLease': { acquirePikkitBrowserLease: async () => ({ release: async () => { released++; return true } }) }, '@/lib/browserbase': { openPikkitSession: async () => browser },
    '@/lib/scrapers/gameMatch': { findAndClickPikkitGame: async () => { finds++; if (scenario === 'low-budget' && finds === 2) extraTime = 60_000; return scenario === 'recovered' && reloads === 1 } },
    '@/lib/scrapers/nbaPikkitScraper': { runNbaPikkitScrape: scrape }, '@/lib/nbaPublicServer': { importNbaPublic: async () => { captures++; return { markets: 9 } } },
    '@/lib/nbaPublic': { NBA_PUBLIC_VERSION: 'nba-public-v2', nbaPublicEventMatches: () => true },
    '@/lib/nbaSharedCache': { nbaSharedCache: async (_key, _ttl, _stale, load) => ({ value: await load() }) },
  }
  const source = fs.readFileSync(new URL('../src/app/api/cron/poll-pikkit-nba-picks/route.ts', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const fixtureModule = { exports: {} }
  new Function('require', 'module', 'exports', 'process', 'Date', 'setTimeout', 'clearTimeout', code)(id => { assert.ok(id in mocks, id); return mocks[id] }, fixtureModule, fixtureModule.exports, { env: { PIKKIT_CONTEXT_ID: 'fixture' } }, Clock, callback => setTimeout(callback, 15), clearTimeout)
  const response = await fixtureModule.exports.GET(new Request('https://fixture.test/api/cron/poll-pikkit-nba-picks'))
  return { status: response.status, body: await response.json(), reloads, finds, captures, closed, released }
}

test('empty NBA league shell recovers with one bounded reload and one capture', async () => {
  const result = await capture('recovered')
  assert.equal(result.status, 200); assert.equal(result.reloads, 1); assert.equal(result.captures, 1)
  assert.equal(result.closed, 1); assert.equal(result.released, 1)
  assert.equal(result.body.results[0].emptyShellReloaded, true)
})

test('an empty shell that remains empty is deferred after one reload without repeat imports', async () => {
  const result = await capture('still-empty')
  assert.equal(result.status, 425); assert.equal(result.reloads, 1); assert.equal(result.captures, 0)
  assert.equal(result.finds, 3); assert.equal(result.closed, 1); assert.equal(result.released, 1)
})

test('populated schedules, controls, sign-in text, other leagues and low budgets never trigger shell recovery', async () => {
  for (const scenario of ['populated-schedule', 'market-controls', 'sign-in-text', 'other-path', 'long-shell', 'low-budget']) {
    const result = await capture(scenario)
    assert.equal(result.status, 425, scenario); assert.equal(result.reloads, 0, scenario); assert.equal(result.captures, 0, scenario)
    assert.equal(result.closed, 1); assert.equal(result.released, 1)
  }
})

test('sign-in redirects stop capture before or after recovery and preserve cleanup', async () => {
  for (const scenario of ['login-redirect', 'reload-login']) {
    const result = await capture(scenario)
    assert.equal(result.status, 503); assert.equal(result.reloads, scenario === 'reload-login' ? 1 : 0)
    assert.equal(result.captures, 0); assert.equal(result.closed, 1); assert.equal(result.released, 1)
    assert.equal(result.body.results[0].diagnostic.authenticationRequired, true)
  }
})

test('a stalled recovery stays inside the existing game deadline and releases the browser', async () => {
  const result = await capture('reload-timeout')
  assert.equal(result.status, 502); assert.equal(result.reloads, 1); assert.equal(result.captures, 0)
  assert.equal(result.body.results[0].diagnostic.deadline, true)
  assert.equal(result.closed, 1); assert.equal(result.released, 1)
})
