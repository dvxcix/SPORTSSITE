import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../package.json', import.meta.url))
const ts = require('typescript')

async function capture(scenario) {
  let reloads = 0, finds = 0, captures = 0, closed = 0, released = 0, extraTime = 0, probes = 0
  let eventOpened = false, responseListener, requestListener
  const navigationTimeout = scenario.startsWith('navigation-timeout')
  const start = Date.now()
  class Clock extends Date { static now() { return start + extraTime } }
  const upcoming = new Date(start + 6 * 3600000)
  const game = { id: 123, date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(upcoming), datetime: upcoming.toISOString(), status_state: 'scheduled', visitor_team: { full_name: 'Boston Celtics' }, home_team: { full_name: 'Detroit Pistons' } }
  const event = { id: 'fixture-event', away: { full: 'Boston Celtics' }, home: { full: 'Detroit Pistons' } }, eventUrl = 'https://app.pikkit.com/event/fixture-event'
  const scrape = () => {}, locator = { filter: () => locator, first: () => locator, click: async () => {}, waitFor: async () => {} }
  const path = () => eventOpened ? '/event/fixture-event' : scenario === 'navigation-timeout-auth' ? '/auth/callback/private-path-token' : scenario === 'navigation-timeout-event' ? '/event/private-event-id' : scenario === 'login-redirect' || scenario === 'reload-login' && reloads ? '/login' : scenario === 'other-path' ? '/leagues/mlb' : '/leagues/nba'
  const browser = { page: {
    setDefaultTimeout() {}, setDefaultNavigationTimeout() {},
    on(name, listener) { if (name === 'request') requestListener = listener; else responseListener = listener }, off(name) { if (name === 'request') requestListener = undefined; else responseListener = undefined },
    goto: async (_url, options) => {
      assert.deepEqual(options, { waitUntil: 'domcontentloaded', timeout: 20000 })
      if (navigationTimeout) { const error = new Error('page.goto: Timeout 20000ms exceeded'); error.name = 'TimeoutError'; throw error }
    },
    url: () => 'https://app.pikkit.com' + path() + '?token=private-query-token#private-fragment',
    waitForTimeout: async () => {}, waitForFunction: async () => {}, getByText: () => locator,
    reload: async options => { assert.deepEqual(options, { waitUntil: 'domcontentloaded', timeout: 20000 }); reloads++; if (scenario === 'reload-timeout') return new Promise(() => {}) },
    evaluate: async (fn, arg) => {
      if (fn === scrape) return { complete: true, props: {}, url: eventUrl, capturedAt: new Date(Clock.now()).toISOString() }
      if (arg !== undefined) {
        probes++
        if (scenario === 'navigation-timeout-stalled') return new Promise(() => {})
        if (scenario === 'navigation-timeout-failed' || scenario === 'navigation-timeout-auth' || scenario === 'navigation-timeout-event') throw new Error('Execution context was destroyed: private-probe-detail')
        if (scenario === 'navigation-timeout-closed') throw new Error('Target page, context or browser has been closed: private-probe-detail')
        if (scenario === 'navigation-timeout-unknown') throw new Error('private-probe-detail')
        const document = { body: { innerText: 'Boston Celtics private-page-content' }, querySelectorAll: selector => selector === 'select' ? [{ options: [{ textContent: 'private-option-label' }] }] : [{ href: '/event/private-event-id', textContent: 'private-event-label' }] }
        return new Function('document', 'arg', `return (${fn.toString()})(arg)`)(document, arg)
      }
      if (fn.toString().includes('querySelectorAll') && arg === undefined) {
        // Execute the actual browser predicate against a minimal DOM fixture.
        const document = { body: { innerText: scenario === 'sign-in-text' ? 'Please sign in to continue' : scenario === 'long-shell' ? 'Loading '.repeat(60) : 'NBA navigation shell' }, querySelectorAll: selector => selector === 'select' && scenario === 'market-controls' ? [{}] : selector.startsWith('a[') && scenario === 'populated-schedule' ? [{}] : [] }
        return new Function('document', 'location', `return (${fn.toString()})()`)(document, { pathname: path() })
      }
      return 'Boston Celtics Detroit Pistons 10/20'
    },
  }, close: async () => { closed++ } }
  const query = { select() { return this }, in() { return this }, order() { return this }, limit: async () => ({ data: [], error: null }) }
  const mocks = {
    'next/server': { NextResponse: { json: Response.json } }, '@/lib/cron-auth': { requireBrowserbaseCronAuth: () => null }, '@/lib/pipelineHealth': { withPipelineHealth: (_name, run) => run },
    '@/lib/nbaPaintData': { getPaintSchedule: async () => ({ games: [game] }) }, '@/lib/nbaPaint': { nbaToday: () => game.date }, '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => query }) },
    '@/lib/nbaOddsClockData': { getNbaOddsGame: async game => game },
    '@/lib/pikkitBrowserLease': { acquirePikkitBrowserLease: async () => ({ release: async () => { released++; return true } }) }, '@/lib/browserbase': { openPikkitSession: async () => browser },
    '@/lib/scrapers/gameMatch': { findAndClickPikkitGame: async () => { finds++; if (scenario === 'low-budget' && finds === 2) extraTime = 60_000; const found = scenario === 'recovered' && reloads === 1; if (found) { eventOpened = true; const request = { url: () => eventUrl }; requestListener?.(request); responseListener?.({ url: () => eventUrl, status: () => 200, request: () => request, json: async () => event }) }; return found } },
    '@/lib/scrapers/pikkitLeagueDate': { observePikkitLeagueDates: () => ({ selectDate: async date => { assert.equal(date, game.date); return true }, dispose() {} }) },
    '@/lib/scrapers/nbaPikkitScraper': { runNbaPikkitScrape: scrape }, '@/lib/nbaPublicServer': { importNbaPublic: async () => { captures++; return { markets: 9 } } },
    '@/lib/nbaPublic': { NBA_PUBLIC_VERSION: 'nba-public-v2', nbaPublicEventMatches: () => true },
    '@/lib/nbaPublicEventIdentity': { nbaPublicResponseKind: () => 'event', nbaPublicEventIdentities: () => [event], nbaVerifiedPublicEvent: (_game, events) => events[0] ?? null, nbaPublicEventUrl: () => eventUrl, nbaPublicEventPageMatches: () => true },
    '@/lib/nbaSharedCache': { nbaSharedCache: async (_key, _ttl, _stale, load) => ({ value: await load() }) },
  }
  const source = fs.readFileSync(new URL('../src/app/api/cron/poll-pikkit-nba-picks/route.ts', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const fixtureModule = { exports: {} }
  new Function('require', 'module', 'exports', 'process', 'Date', 'setTimeout', 'clearTimeout', code)(id => { assert.ok(id in mocks, id); return mocks[id] }, fixtureModule, fixtureModule.exports, { env: { PIKKIT_CONTEXT_ID: 'fixture' } }, Clock, callback => setTimeout(callback, 15), clearTimeout)
  const response = await fixtureModule.exports.GET(new Request('https://fixture.test/api/cron/poll-pikkit-nba-picks'))
  return { status: response.status, body: await response.json(), reloads, finds, captures, closed, released, probes }
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
    assert.equal(result.body.results[0].diagnostic.path, '/login')
    assert.equal(result.probes, 0)
  }
})

test('navigation timeout retains a sanitized path and error category when the diagnostic probe fails', async () => {
  for (const [scenario, category] of [['navigation-timeout-failed', 'execution-context'], ['navigation-timeout-closed', 'page-closed'], ['navigation-timeout-unknown', 'probe-failed'], ['navigation-timeout-stalled', 'deadline']]) {
    const result = await capture(scenario)
    assert.equal(result.status, 502, scenario)
    assert.deepEqual(result.body.results[0].diagnostic, { path: '/leagues/nba', diagnosticError: category })
    assert.equal(result.probes, 1); assert.equal(result.finds, 0); assert.equal(result.reloads, 0); assert.equal(result.captures, 0)
    assert.equal(result.closed, 1); assert.equal(result.released, 1)
    assert.doesNotMatch(JSON.stringify(result.body.results[0].diagnostic), /private-/)
  }
})

test('timeout diagnostics retain authentication state and redact dynamic event paths without resuming capture', async () => {
  for (const [scenario, diagnostic] of [['navigation-timeout-auth', { path: '/auth', authenticationRequired: true, diagnosticError: 'execution-context' }], ['navigation-timeout-event', { path: '/event/[redacted]', diagnosticError: 'execution-context' }]]) {
    const result = await capture(scenario)
    assert.equal(result.status, 502)
    assert.deepEqual(result.body.results[0].diagnostic, diagnostic)
    assert.equal(result.finds, 0); assert.equal(result.reloads, 0); assert.equal(result.captures, 0)
    assert.equal(result.closed, 1); assert.equal(result.released, 1)
    assert.doesNotMatch(JSON.stringify(diagnostic), /private-/)
  }
})

test('a successful timeout diagnostic contains counts and flags without page text, option labels or event links', async () => {
  const result = await capture('navigation-timeout-readable')
  assert.equal(result.status, 502)
  assert.deepEqual(result.body.results[0].diagnostic, { path: '/leagues/nba', bodyLength: 'Boston Celtics private-page-content'.length, signIn: false, awayTeamMentioned: true, selectCount: 1, eventCount: 1 })
  assert.doesNotMatch(JSON.stringify(result.body.results[0].diagnostic), /private-/)
  assert.equal(result.finds, 0); assert.equal(result.reloads, 0); assert.equal(result.captures, 0)
  assert.equal(result.closed, 1); assert.equal(result.released, 1)
})

test('a stalled recovery stays inside the existing game deadline and releases the browser', async () => {
  const result = await capture('reload-timeout')
  assert.equal(result.status, 502); assert.equal(result.reloads, 1); assert.equal(result.captures, 0)
  assert.equal(result.body.results[0].diagnostic.deadline, true)
  assert.equal(result.closed, 1); assert.equal(result.released, 1)
})
