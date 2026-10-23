import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as paint from '../src/lib/nbaPaint.ts'
import * as mode from '../src/lib/nbaOddsMode.ts'
import * as identity from '../src/lib/nbaPublicEventIdentity.ts'

type FixtureEvent = { _id: string; start_time: string; event_info: { league: { short: string }; away: { short: string; full: string }; home: { short: string; full: string } } }
const fixture = JSON.parse(await readFile(new URL('./fixtures/nba-public-event.json', import.meta.url), 'utf8')) as { url: string; text: string; response: { event: FixtureEvent } }
const now = Date.parse('2026-10-21T22:50:00Z')
const game = { id: 123, date: '2026-10-21', datetime: fixture.response.event.start_time, status: 'Scheduled', status_state: 'scheduled', period: 0,
  visitor_team: { abbreviation: 'ATL', full_name: 'Atlanta Hawks' }, home_team: { abbreviation: 'ORL', full_name: 'Orlando Magic' } } as paint.PaintGame
const responseUrl = fixture.url.replace('app.pikkit.com', 'prod-website.pikkit.app')

test('retained time-only page verifies against exact dated NBA event metadata, teams and URL', () => {
  assert.doesNotMatch(fixture.text, /10\/21/)
  const events = identity.nbaPublicEventIdentities(responseUrl, fixture.response)
  const selected = identity.nbaVerifiedPublicEvent(game, events, now)!
  assert.ok(selected)
  assert.equal(identity.nbaPublicEventPageMatches(game, selected, fixture.url, fixture.text, now), true)
  assert.equal(identity.nbaPublicEventPageMatches(game, selected, 'https://app.pikkit.com/leagues/nba', fixture.text, now), false)
  assert.equal(identity.nbaPublicEventPageMatches(game, selected, fixture.url, 'Atlanta Hawks 6:00 PM', now), false)
  assert.equal(identity.nbaPublicEventPageMatches(game, selected, fixture.url, fixture.text, Date.parse(game.datetime!)), false)
})

test('wrong league, oriented teams, full timestamp, source origin and response event ID fail closed', () => {
  for (const change of [
    (event: FixtureEvent) => { event.event_info.league.short = 'NFL' },
    (event: FixtureEvent) => { event.event_info.away.short = 'BOS' },
    (event: FixtureEvent) => { event.event_info.home.full = 'Boston Celtics' },
    (event: FixtureEvent) => { [event.event_info.away, event.event_info.home] = [event.event_info.home, event.event_info.away] },
    (event: FixtureEvent) => { event.start_time = '2026-10-22T23:00:00Z' },
    (event: FixtureEvent) => { event.start_time = '2025-10-21T23:00:00Z' },
    (event: FixtureEvent) => { event.start_time = '2026-10-21T23:30:00Z' },
    (event: FixtureEvent) => { event._id = 'different-event' },
  ]) {
    const payload = structuredClone(fixture.response); change(payload.event)
    assert.equal(identity.nbaVerifiedPublicEvent(game, identity.nbaPublicEventIdentities(responseUrl, payload), now), null)
  }
  assert.deepEqual(identity.nbaPublicEventIdentities(responseUrl.replace('prod-website.pikkit.app', 'untrusted.example'), fixture.response), [])
  assert.deepEqual(identity.nbaPublicEventIdentities(responseUrl + '?other=true', fixture.response), [])
  const selected = identity.nbaPublicEventIdentities(responseUrl, fixture.response)[0]
  assert.equal(identity.nbaVerifiedPublicEvent({ ...game, datetime: '2026-10-21T22:00:00Z' }, [selected], now), null)
})

test('duplicate observations are safe; ambiguous or conflicting event identities are rejected', () => {
  const original = identity.nbaPublicEventIdentities(responseUrl, fixture.response)[0]
  assert.equal(identity.nbaVerifiedPublicEvent(game, [original, original], now)?.id, original.id)
  assert.throws(() => identity.nbaVerifiedPublicEvent(game, [original, { ...original, id: 'another-event' }], now), /ambiguous/)
  assert.throws(() => identity.nbaVerifiedPublicEvent(game, [original, { ...original, start: '2026-10-22T23:00:00Z' }], now), /conflicting/)
})

async function compiled<T>(file: string, imports: Record<string, unknown>, globals: Record<string, unknown> = {}): Promise<T> {
  const source = await readFile(new URL(file, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const target = { exports: {} }
  new Function('require', 'module', 'exports', ...Object.keys(globals), output)((name: string) => { assert.ok(name in imports, name); return imports[name] }, target, target.exports, ...Object.values(globals))
  return target.exports as T
}

async function capture(scenario: string) {
  let current = '', captured = 0, closed = 0, released = 0, clockReads = 0, clock = now, finds = 0, navigation = 0
  let listener: ((response: unknown) => void) | undefined, requestListener: ((request: unknown) => void) | undefined
  class Clock extends Date { constructor(value: string | number = clock) { super(value) } static now() { return clock } }
  const actualIdentity = await compiled<typeof identity>('../src/lib/nbaPublicEventIdentity.ts', { './nbaPaint': paint, './nbaOddsMode': mode }, { Date: Clock })
  const scrape = () => {}, locator = { filter: () => locator, first: () => locator, click: async () => {}, waitFor: async () => {} }
  const event = structuredClone(fixture.response.event)
  if (scenario === 'wrong-start') event.start_time = '2026-10-22T23:00:00Z'
  const emit = (url: string, payload: unknown, priorRequest = false) => {
    const request = { url: () => url }
    if (!priorRequest) requestListener?.(request)
    listener?.({ url: () => url, status: () => 200, request: () => request, json: async () => payload })
  }
  const openEvent = () => {
    current = fixture.url
    if (scenario === 'unrelated-first') emit(responseUrl.replace(event._id, 'unrelated'), { event: { ...event, _id: 'unrelated', start_time: '2026-10-22T23:00:00Z' } })
    if (scenario === 'prior-request') emit(responseUrl, { event }, true)
    else if (scenario !== 'missing-event-response') emit(responseUrl, { event })
  }
  const browser = { page: {
    setDefaultTimeout() {}, setDefaultNavigationTimeout() {},
    on(name: string, fn: typeof listener) { if (name === 'request') requestListener = fn; else listener = fn }, off(name: string) { if (name === 'request') requestListener = undefined; else listener = undefined },
    goto: async (url: string) => {
      current = url; navigation++
      if (url === fixture.url) openEvent()
      else if (!['wrong-start', 'missing-event-response', 'league-only'].includes(scenario)) emit('https://prod-website.pikkit.app/league/events?league=NBA', { events: scenario === 'ambiguous' ? [event, { ...event, _id: 'second-event' }] : [event] })
    },
    url: () => current, waitForFunction: async () => {}, waitForTimeout: async () => {}, getByText: () => locator,
    evaluate: async (fn: unknown, diagnosticArg?: unknown) => {
      if (fn === scrape) {
        if (scenario === 'post-tip') clock = Date.parse(game.datetime!)
        if (scenario === 'changed-url') current = 'https://app.pikkit.com/event/other-event'
        if (scenario === 'changed-metadata') emit(responseUrl, { event: { ...event, start_time: '2026-10-22T23:00:00Z' } })
        const skew = scenario === 'positive-skew' ? 30000 : scenario === 'negative-skew' ? -30000 : scenario === 'stale-payload' ? -60001 : scenario === 'future-payload' ? 60001 : 0
        const capturedAt = scenario === 'timestamp-at-tip' ? game.datetime : scenario === 'invalid-timestamp' ? 'invalid' : new Clock(clock + skew).toISOString()
        return { complete: true, url: scenario === 'payload-url' ? 'https://app.pikkit.com/event/other-event' : fixture.url, capturedAt, props: { Points: { 'Paolo Banchero': 10 } } }
      }
      if (diagnosticArg) return { bodyLength: fixture.text.length, signIn: false, awayTeamMentioned: true, selectCount: 1, eventCount: 0 }
      return fixture.text
    },
  }, close: async () => { closed++ } }
  const query = { select: () => query, in: () => query, limit: async () => ({ data: [], error: null }) }
  const route = await compiled<{ GET: (request: Request) => Promise<Response> }>('../src/app/api/cron/poll-pikkit-nba-picks/route.ts', {
    'next/server': { NextResponse: { json: Response.json } }, '@/lib/cron-auth': { requireBrowserbaseCronAuth: () => null }, '@/lib/pipelineHealth': { withPipelineHealth: (_name: string, run: unknown) => run },
    '@/lib/nbaPaintData': { getPaintSchedule: async () => ({ games: [game] }) }, '@/lib/nbaPaint': { nbaToday: () => game.date },
    '@/lib/nbaOddsClockData': { getNbaOddsGame: async (value: paint.PaintGame) => { clockReads++; return scenario === 'canonical-tip-changed' && clockReads > 1 ? { ...value, datetime: '2026-10-21T22:00:00Z' } : value } },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => query }) }, '@/lib/pikkitBrowserLease': { acquirePikkitBrowserLease: async () => ({ release: async () => { released++; return true } }) },
    '@/lib/browserbase': { openPikkitSession: async () => browser }, '@/lib/scrapers/gameMatch': { findAndClickPikkitGame: async () => { finds++; if (scenario !== 'league-only') openEvent(); return true } },
    '@/lib/scrapers/nbaPikkitScraper': { runNbaPikkitScrape: scrape }, '@/lib/nbaPublicServer': { importNbaPublic: async () => { captured++; return { markets: 1 } } },
    '@/lib/nbaPublic': { NBA_PUBLIC_VERSION: 'nba-public-v2' }, '@/lib/nbaPublicEventIdentity': actualIdentity,
    '@/lib/nbaSharedCache': { nbaSharedCache: async (_key: string, _ttl: number, _stale: number, load: () => Promise<unknown>) => ({ value: await load() }) },
  }, { Date: Clock, process: { env: { PIKKIT_CONTEXT_ID: 'fixture-only' } }, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms === 15000 ? 5 : 100), clearTimeout })
  const response = await route.GET(new Request('https://fixture.test/capture'))
  return { status: response.status, body: await response.json(), captured, closed, released, finds, navigation, listener, requestListener }
}

test('scheduled NBA collector imports time-only header through exact listing, fresh event response and canonical tip', async () => {
  for (const scenario of ['healthy', 'unrelated-first', 'positive-skew', 'negative-skew']) {
    const result = await capture(scenario)
    assert.equal(result.status, 200, scenario); assert.equal(result.captured, 1, scenario)
    assert.equal(result.finds, 0, 'exact structured event navigation avoids false-positive league card clicks')
    assert.equal(result.navigation, 2); assert.equal(result.closed, 1); assert.equal(result.released, 1); assert.equal(result.listener, undefined); assert.equal(result.requestListener, undefined)
  }
})

test('scheduled collector rejects unverified, ambiguous, changed and post-tip events and always releases its listener/browser', async () => {
  for (const scenario of ['wrong-start', 'missing-event-response', 'prior-request', 'league-only', 'ambiguous', 'changed-url', 'payload-url', 'post-tip', 'canonical-tip-changed', 'changed-metadata', 'stale-payload', 'future-payload', 'timestamp-at-tip', 'invalid-timestamp']) {
    const result = await capture(scenario)
    assert.equal(result.status, 502, scenario); assert.equal(result.captured, 0, scenario)
    assert.equal(result.closed, 1, scenario); assert.equal(result.released, 1, scenario); assert.equal(result.listener, undefined, scenario); assert.equal(result.requestListener, undefined, scenario)
  }
})
