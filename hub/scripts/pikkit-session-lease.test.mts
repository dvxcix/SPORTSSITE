import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as crypto from 'node:crypto'
import ts from 'typescript'

async function compiled<T>(file: string, imports: Record<string, unknown>): Promise<T> {
  const source = await readFile(new URL(file, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const target = { exports: {} }
  new Function('require', 'module', 'exports', 'process', output)((name: string) => { assert.ok(name in imports, name); return imports[name] }, target, target.exports, { env: { PIKKIT_CONTEXT_ID: 'fixture' } })
  return target.exports as T
}

test('an unconfirmed browser retains its safety lease; an ownership mismatch never reports successful release', async () => {
  for (const confirmed of [false, true]) for (const owned of [false, true]) {
    const calls: string[] = []
    const leaseModule = await compiled<typeof import('../src/lib/pikkitBrowserLease.ts')>('../src/lib/pikkitBrowserLease.ts', {
      'node:crypto': crypto, '@/lib/supabase/admin': { createAdminClient: () => ({ rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push(name)
        if (name === 'try_acquire_browser_automation_lease') { assert.equal(args.p_ttl_seconds, 360); return { data: true, error: null } }
        assert.equal(args.p_cooldown_seconds, 8)
        return { data: owned, error: null }
      } }) },
    })
    const lease = (await leaseModule.acquirePikkitBrowserLease())!
    assert.deepEqual(await Promise.all([lease.release(confirmed), lease.release(confirmed)]), [confirmed && owned, confirmed && owned])
    assert.equal(calls.filter(name => name === 'release_browser_automation_lease').length, confirmed ? 1 : 0)
  }
})

type Scenario = 'startup' | 'shutdown' | 'navigation' | 'no-game' | 'healthy'
type FixtureOptions = { cron?: boolean; role?: string | null; authError?: boolean; profileError?: boolean; dest?: string; site?: string; validateStatus?: number | null; validateUrl?: string; url?: string; shell?: boolean }
async function fixture(kind: 'mlb' | 'mlb-batch' | 'nfl' | 'auth' | 'admin', scenario: Scenario, options: FixtureOptions = {}) {
  let opens = 0, closes = 0, releases = 0
  let authReads = 0
  const steps: string[] = []
  const listeners = new Map<string, (response: { url: () => string; status: () => number }) => void>()
  const idle: boolean[] = []
  const lease = { release: async (confirmed = true) => { idle.push(confirmed); if (confirmed) releases++; return confirmed } }
  const page = {
    goto: async (url: string) => {
      steps.push(url)
      if (scenario === 'navigation') throw Error('fixture navigation failure')
      if (options.validateStatus !== null) listeners.get('response')?.({ url: () => options.validateUrl ?? 'https://prod-website.pikkit.app/login/validate', status: () => options.validateStatus ?? 200 })
    },
    waitForTimeout: async () => {}, waitForFunction: async () => {},
    on: (event: string, listener: (response: { url: () => string; status: () => number }) => void) => { listeners.set(event, listener) },
    off: (event: string) => { listeners.delete(event) },
    url: () => options.url ?? 'https://app.pikkit.com/leagues/nba?private-fixture=do-not-return', title: async () => 'Events',
    evaluate: async () => kind === 'auth' ? options.shell === false ? '' : 'Your Bets' : { hasAuthenticatedShell: true },
    context: () => ({ newPage: async () => page, cookies: async () => {
      steps.push('cookies')
      return [
        { name: 'session_id', domain: '.pikkit.com', path: '/leagues', expires: 1900000000, secure: true, httpOnly: true, sameSite: 'Lax', value: 'never-return-this-secret' },
        { name: 'session_id', domain: 'prod-website.pikkit.app', path: '/', expires: -1, secure: true, httpOnly: false, sameSite: 'None', value: '' },
        { name: 'other_cookie', domain: '.pikkit.com', path: '/', value: 'never-return-this-either' },
        { name: 'session_id', domain: 'other-site.example', path: '/', value: 'unrelated-cookie' },
      ]
    } }), close: async () => {},
  }
  const open = async () => {
    opens++
    if (scenario === 'startup') throw Error('fixture uncertain startup')
    return { page, close: async () => { closes++; if (scenario === 'shutdown') throw Error('fixture uncertain shutdown') } }
  }
  const common = {
    'next/server': { NextResponse: { json: Response.json } }, '@/lib/cron-auth': { requireBrowserbaseCronAuth: () => options.cron === false ? Response.json({ error: 'Unauthorized' }, { status: 401 }) : null },
    '@/lib/supabase/server': { createClient: async () => {
      authReads++
      return { auth: { getUser: async () => ({ data: { user: options.role === null ? null : { id: 'fixture-user' } }, error: options.authError ? Error('auth failure') : null }) }, from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { account_type: options.role ?? 'admin' }, error: options.profileError ? Error('profile failure') : null }) }) }) }) }
    } },
    '@/lib/browserbase': { openPikkitSession: open }, '@/lib/pikkitBrowserLease': { acquirePikkitBrowserLease: async () => lease },
    '@/lib/safeApiError': { safeApiError: (_scope: string, _error: unknown, message: string, status: number) => Response.json({ error: message }, { status }) },
  }
  let result: unknown
  let responseBody: unknown, cacheControl: string | null = null
  if (kind === 'auth') {
    const auth = await compiled<typeof import('../src/lib/scrapers/pikkitAuth.ts')>('../src/lib/scrapers/pikkitAuth.ts', {
      ...common,
      '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => ({
        delete: () => ({ eq: async () => ({ error: null }) }),
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: 'already-alerted-fixture' } }) }) }),
      }) }) },
      '@/lib/email': { brandedEmailHtml: () => { throw Error('unexpected alert') }, sendEmail: () => { throw Error('unexpected alert') } },
      '@/lib/discord': { postAlert: () => { throw Error('unexpected alert') } },
    })
    result = await auth.checkPikkitAuthAndAlert('fixture')
  } else {
    const mlb = kind === 'mlb' || kind === 'mlb-batch'
    const game = { gamePk: 123, gameKey: 'fixture', awayTeam: 'Away Team', homeTeam: 'Home Team', gameId: '123', awayName: 'Away Team', homeName: 'Home Team' }
    const from = () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) })
    const file = kind === 'admin' ? '../src/app/api/admin/pikkit-context-check/route.ts' : `../src/app/api/cron/scrape-pikkit${mlb ? '' : '-nfl'}/route.ts`
    const route = await compiled<{ GET: (request: Request) => Promise<Response> }>(file, {
      ...common, '@/lib/platform': { PLATFORM_URL: 'https://fixture.test' }, '@/lib/supabase/admin': { createAdminClient: () => ({ from }) },
      '@slipsurge/core/mlbSchedule': { getTodaysMatchups: async () => scenario === 'no-game' ? [] : [game] },
      '@/lib/nflPikkitSchedule': { getUpcomingNflPikkitGames: async () => scenario === 'no-game' ? [] : [game] },
      '@/lib/scrapers/pikkitScraper': { runPikkitScrape: () => {} }, '@/lib/scrapers/pikkitAuth': { PIKKIT_SIGNED_OUT_ERROR: 'fixture missing listing' },
      '@/lib/pikkitCoverage': {}, '@/lib/scrapers/gameMatch': { findAndClickPikkitGame: async () => false, distinguishingSuffix: (value: string) => value, legIndexFor: () => 0 },
    })
    const response = await route.GET(new Request(`https://fixture.test/capture?${kind === 'mlb-batch' ? 'gamePks=123' : mlb ? 'gamePk=123' : 'gameId=123'}`, { headers: { 'sec-fetch-dest': options.dest ?? 'document', 'sec-fetch-site': options.site ?? 'same-origin' } }))
    result = response.status
    responseBody = await response.json()
    cacheControl = response.headers.get('Cache-Control')
  }
  return { opens, closes, releases, idle, result, responseBody, cacheControl, authReads, steps, listenerCount: listeners.size }
}

test('MLB, NFL and administrative consumers retain the lease after uncertain startup or shutdown', async () => {
  for (const kind of ['mlb', 'mlb-batch', 'nfl', 'auth', 'admin'] as const) for (const scenario of ['startup', 'shutdown'] as const) {
    const result = await fixture(kind, scenario)
    assert.equal(result.opens, 1, kind)
    assert.equal(result.closes, scenario === 'startup' ? 0 : 1, kind)
    assert.equal(result.releases, 0, kind)
    assert.deepEqual(result.idle, [false], kind)
    assert.equal(result.result, kind === 'auth' ? 'unknown' : 502, kind)
  }
})

test('admin diagnostics require verified admin navigation or cron auth before opening a browser', async () => {
  for (const [options, status] of [
    [{ cron: false, role: null }, 401], [{ cron: false, role: 'member' }, 403],
    [{ cron: false, role: 'admin', authError: true }, 401], [{ cron: false, role: 'admin', profileError: true }, 503],
    [{ cron: false, role: 'admin', dest: 'image' }, 403], [{ cron: false, role: 'admin', dest: 'iframe' }, 403],
    [{ cron: false, role: 'admin', site: 'cross-site' }, 403], [{ cron: false, role: 'admin', site: 'same-site' }, 403],
    [{ cron: false, role: 'admin', dest: '', site: '' }, 403],
  ] as const) {
    const result = await fixture('admin', 'healthy', options)
    assert.equal(result.result, status)
    assert.equal(result.opens, 0)
    assert.equal(result.cacheControl, 'private, no-store')
  }
  for (const options of [{ cron: false, role: 'admin', site: 'none' }, { cron: false, role: 'admin' }, { cron: true, role: null, dest: '', site: '' }]) {
    const result = await fixture('admin', 'healthy', options)
    assert.equal(result.result, 200)
    assert.equal(result.opens, 1)
    assert.equal(result.authReads, options.cron ? 0 : 1)
  }
})

test('diagnostics report only cookie metadata before league navigation and sanitized validation results', async () => {
  const result = await fixture('admin', 'healthy')
  assert.deepEqual(result.steps, ['cookies', 'https://app.pikkit.com/leagues/nba'])
  assert.deepEqual(result.responseBody, {
    sessionCookiesBefore: [
      { domain: '.pikkit.com', path: '/leagues', expires: 1900000000, secure: true, httpOnly: true, sameSite: 'Lax', present: true },
      { domain: 'prod-website.pikkit.app', path: '/', expires: -1, secure: true, httpOnly: false, sameSite: 'None', present: false },
    ], loginValidateStatuses: [200], pathname: '/leagues/nba', hasAuthenticatedShell: true,
  })
  assert.doesNotMatch(JSON.stringify(result.responseBody), /never-return|do-not-return|unrelated-cookie|other_cookie|fixture-user/)
  assert.equal(result.cacheControl, 'private, no-store')
  assert.equal(result.listenerCount, 0)
  const untrusted = await fixture('admin', 'healthy', { validateUrl: 'https://other-site.example/login/validate', url: 'https://other-site.example/login?secret=fixture' })
  assert.deepEqual((untrusted.responseBody as { loginValidateStatuses: number[] }).loginValidateStatuses, [])
  assert.equal((untrusted.responseBody as { pathname: string }).pathname, '/other')
})

test('authentication health requires validation success and a rendered shell; missing or unavailable validation never alerts', async () => {
  for (const options of [{ validateStatus: null }, { validateStatus: 500 }, { validateStatus: 429 }, { validateUrl: 'https://other-site.example/login/validate' }, { shell: false }]) {
    const result = await fixture('auth', 'healthy', options)
    assert.equal(result.result, 'unknown')
    assert.equal(result.releases, 1)
    assert.equal(result.listenerCount, 0)
    assert.deepEqual(result.steps, ['https://app.pikkit.com/leagues/mlb'])
  }
  assert.equal((await fixture('auth', 'healthy')).result, 'signed-in')
  for (const options of [{ validateStatus: 401 }, { validateStatus: 403 }, { url: 'https://app.pikkit.com/login' }]) {
    assert.equal((await fixture('auth', 'healthy', options)).result, 'signed-out')
  }
})

test('confirmed close releases the lease even when capture fails, while preflight exits never open a browser', async () => {
  for (const kind of ['mlb', 'mlb-batch', 'nfl', 'auth', 'admin'] as const) {
    const result = await fixture(kind, 'navigation')
    assert.equal(result.opens, 1, kind); assert.equal(result.closes, 1, kind)
    assert.equal(result.releases, 1, kind); assert.deepEqual(result.idle, [true], kind)
  }
  for (const kind of ['mlb', 'mlb-batch', 'nfl'] as const) {
    const result = await fixture(kind, 'no-game')
    assert.equal(result.opens, 0, kind); assert.equal(result.closes, 0, kind)
    assert.equal(result.releases, 1, kind); assert.deepEqual(result.idle, [true], kind)
  }
  for (const kind of ['auth', 'admin'] as const) {
    const result = await fixture(kind, 'healthy')
    assert.equal(result.result, kind === 'auth' ? 'signed-in' : 200)
    assert.equal(result.releases, 1, kind)
  }
})
