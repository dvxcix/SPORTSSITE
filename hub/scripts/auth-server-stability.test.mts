import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server'
import * as authErrors from '../src/lib/supabase/authErrors.ts'
import { isMlbOnlyPath, isMlbPullPath } from '../src/lib/mlbOffseasonAccess.ts'

async function compiled(file: string, imports: Record<string, unknown>, fallback?: (name: string) => unknown) {
  const source = await readFile(new URL('../src/' + file, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } })
  const target = { exports: {} as Record<string, any> }
  new Function('require', 'exports', 'module', outputText)((name: string) => {
    if (name.endsWith('/authErrors') || name === './authErrors') return authErrors
    if (name === 'next/server') return { NextResponse }
    if (name in imports) return imports[name]
    if (fallback) return fallback(name)
    throw new Error('Unexpected import: ' + name)
  }, target.exports, target)
  return target.exports
}
type Cookie = { name: string; value: string; options?: { path?: string; maxAge?: number; httpOnly?: boolean } }
type AuthResult = { data: { claims?: { sub: string }; user?: { id: string } | null } | null; error: unknown }
const signedIn = { data: { claims: { sub: 'member-a' } }, error: null }
const temporary = { name: 'AuthRetryableFetchError', status: 503 }
const rotated = { name: 'AuthApiError', status: 400, code: 'refresh_token_already_used' }
const cookieName = 'sb-primary-auth-token'

async function proxyFixture(options: { result?: AuthResult; throws?: unknown; updates?: Cookie[][]; profile?: Record<string, unknown> | null; profileError?: unknown; queryThrows?: boolean } = {}) {
  let clientCalls = 0, queryCalls = 0
  const query = () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => {
    queryCalls++
    if (options.queryThrows) throw new TypeError('fetch failed')
    return { data: options.profile === undefined ? { onboarding_completed_at: '2026-10-01', account_type: 'user' } : options.profile, error: options.profileError ?? null }
  } }) }) })
  const mod = await compiled('lib/supabase/middleware.ts', {
    '@/lib/mlbOffseason': { MLB_HIBERNATING: true },
    '@/lib/mlbOffseasonAccess': { isMlbOnlyPath, isMlbPullPath },
    '@supabase/supabase-js': { createClient: () => ({
      auth: { getUser: async () => {
        if (options.throws) throw options.throws
        const result = options.result ?? signedIn
        return { data: { user: result.error ? null : result.data?.claims?.sub ? { id: result.data.claims.sub } : null }, error: result.error }
      } }, from: query,
    }) },
    '@supabase/ssr': { createServerClient: (_url: string, _key: string, settings: any) => {
      clientCalls++
      return {
        auth: {
          getClaims: async () => {
            for (const updates of options.updates ?? []) settings.cookies.setAll(updates, { 'Cache-Control': 'private, no-store', Pragma: 'no-cache' })
            if (options.throws) throw options.throws
            return options.result ?? signedIn
          },
          mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { nextLevel: 'aal1', currentLevel: 'aal1' }, error: null }) },
        },
        from: query,
      }
    } },
  })
  return {
    run: (path: string, retry = false, accept = 'application/json', bearer?: string) => mod.updateSession(new NextRequest('https://www.slipsurge.com' + path, { headers: { cookie: cookieName + '=old-session' + (retry ? '; ss-auth-refresh-retry=1' : ''), accept, ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) } })) as Promise<NextResponse>,
    get clientCalls() { return clientCalls }, get queryCalls() { return queryCalls },
  }
}

test('offseason hides baseball pages and APIs from members while allowing administrators', async () => {
  const paths = ['/dugout', '/api/dugout/data', '/players/123', '/api/players/123', '/sports/mlb/123', '/api/matrices', '/api/matrix-marketplace', '/api/odds/mlb', '/api/search/sports']
  for (const path of paths) {
    assert.equal(isMlbOnlyPath(path), true, path)
    assert.equal((await (await proxyFixture()).run(path)).status, 404, path)
    const admin = await proxyFixture({ profile: { account_type: 'admin', onboarding_completed_at: '2026-10-01' } })
    const expected = isMlbPullPath(path) ? 503 : 200
    assert.equal((await admin.run(path)).status, expected, path)
    if (path.startsWith('/api/')) {
      assert.equal((await (await proxyFixture()).run(path, false, 'application/json', 'member-token')).status, 404, path)
      assert.equal((await admin.run(path, false, 'application/json', 'admin-token')).status, expected, path)
    }
  }
  for (const path of ['/the-sideline', '/the-paint', '/api/nfl/players/123', '/api/nba-matrices', '/sports/nba/123', '/api/nfl-matrix-marketplace']) assert.equal(isMlbOnlyPath(path), false, path)
  assert.equal(isMlbOnlyPath('/dugout-other'), false)
  assert.equal(isMlbOnlyPath('/%64ugout'), true)
  assert.equal(isMlbOnlyPath('/marketplace/abc'), true)
  assert.equal(isMlbOnlyPath('/marketplace/sell'), false)
  for (const path of ['/api/slate/games', '/api/mlb/games', '/api/search/sports', '/api/weather-lab', '/api/players/123/today', '/api/dugout/data', '/api/composer/games', '/sports/mlb/123', '/mlb/teams/123']) assert.equal(isMlbPullPath(path), true, path)
  for (const path of ['/api/players/123', '/api/players/123/pitch-log', '/api/matrices', '/api/odds-terminal', '/sports/nfl/123']) assert.equal(isMlbPullPath(path), false, path)
})

test('baseball bearer authorization fails closed during outages and invalid sessions', async () => {
  const expired = await proxyFixture({ result: { data: null, error: { status: 401 } } })
  assert.equal((await expired.run('/api/mlb/games', false, 'application/json', 'bad-token')).status, 401)
  const outage = await proxyFixture({ profileError: { code: 'PGRST002' } })
  assert.equal((await outage.run('/api/mlb/games', false, 'application/json', 'token')).status, 503)
  const beta = await proxyFixture({ profile: { account_type: 'user', beta_access_active: true } })
  assert.equal((await beta.run('/api/mlb/games', false, 'application/json', 'token')).status, 404)
})

test('parallel refresh losers cannot delete a winning session, including a second retry-marked request', async () => {
  const winner = await proxyFixture({ updates: [[{ name: cookieName, value: 'fresh-session', options: { path: '/', httpOnly: true } }]] })
  const loser = await proxyFixture({ result: { data: null, error: rotated }, updates: [[{ name: cookieName, value: '', options: { path: '/', maxAge: 0 } }]] })
  const [won, ...lost] = await Promise.all([winner.run('/api/account/me'), ...Array.from({ length: 20 }, (_, i) => loser.run('/api/account/me', i % 2 === 0))])
  assert.equal(won.cookies.get(cookieName)?.value, 'fresh-session')
  for (const response of lost) {
    assert.equal(response.status, 503)
    assert.equal((await response.json()).code, 'SESSION_REFRESH_RETRY')
    assert.equal(response.headers.get('set-cookie'), null)
    assert.equal(response.headers.get('location'), null)
    assert.equal(response.headers.get('x-middleware-next'), null)
  }
})

test('Auth outage and thrown fetch failures are retryable, private, and never login redirects', async () => {
  for (const options of [{ result: { data: null, error: temporary } }, { throws: new TypeError('fetch failed') }]) {
    const fixture = await proxyFixture(options)
    const response = await fixture.run('/feed')
    assert.equal(response.status, 503)
    assert.equal((await response.json()).code, 'AUTH_TEMPORARILY_UNAVAILABLE')
    assert.match(response.headers.get('cache-control') ?? '', /no-store/)
    assert.equal(response.headers.get('set-cookie'), null)
    assert.equal(response.headers.get('location'), null)
    assert.equal(fixture.queryCalls, 0)
  }
  const response = await (await proxyFixture({ result: { data: null, error: temporary } })).run('/feed', false, 'text/html')
  assert.equal(response.status, 503)
  assert.match(await response.text(), /Try again/)
})

test('intentional onboarding redirect and admin denial retain all rotated cookies and no-cache headers', async () => {
  const updates = [[{ name: cookieName + '.0', value: 'first', options: { path: '/', httpOnly: true } }], [{ name: cookieName + '.1', value: 'second', options: { path: '/', httpOnly: true } }]]
  for (const [path, status, profile] of [['/feed', 307, { onboarding_completed_at: null }], ['/api/admin/report', 403, { account_type: 'user' }]] as const) {
    const fixture = await proxyFixture({ updates, profile })
    const response = await fixture.run(path)
    assert.equal(response.status, status)
    assert.equal(response.cookies.get(cookieName + '.0')?.value, 'first')
    assert.equal(response.cookies.get(cookieName + '.1')?.value, 'second')
    assert.equal(response.cookies.get(cookieName + '.0')?.httpOnly, true)
    assert.match(response.headers.get('cache-control') ?? '', /no-store/)
    assert.equal(response.headers.get('pragma'), 'no-cache')
    assert.equal(response.headers.get('x-middleware-next'), null)
  }
})

test('profile outages cannot become onboarding redirects or membership denials and retain a completed refresh', async () => {
  for (const options of [{ profileError: { code: 'PGRST002' } }, { queryThrows: true }]) {
    for (const path of ['/feed', '/api/admin/report']) {
      const fixture = await proxyFixture({ ...options, updates: [[{ name: cookieName, value: 'fresh-session' }]] })
      const response = await fixture.run(path)
      assert.equal(response.status, 503)
      assert.equal(response.headers.get('location'), null)
      assert.equal(response.cookies.get(cookieName)?.value, 'fresh-session')
    }
  }
})

test('signed-out and invalid-token requests remain blocked; login callbacks do not re-refresh old cookies', async () => {
  for (const error of [null, { name: 'AuthApiError', status: 401, code: 'bad_jwt' }]) {
    const fixture = await proxyFixture({ result: { data: null, error } })
    assert.equal((await fixture.run('/api/account/me')).status, 401)
    const page = await fixture.run('/feed?tab=picks')
    assert.equal(page.status, 307)
    const url = new URL(page.headers.get('location')!)
    assert.equal(url.pathname, '/auth/login')
    assert.equal(url.searchParams.get('next'), '/feed?tab=picks')
  }
  for (const path of ['/auth/login', '/auth/callback?code=test']) {
    const fixture = await proxyFixture({ result: { data: null, error: rotated } })
    const response = await fixture.run(path)
    assert.equal(fixture.clientCalls, 0)
    assert.equal(response.headers.get('x-middleware-next'), '1')
    assert.equal(response.headers.get('set-cookie'), null)
  }
})

async function serverFixture(result: AuthResult, throws = false) {
  const writes: Cookie[] = []
  const mod = await compiled('lib/supabase/server.ts', {
    'next/headers': { cookies: async () => ({ getAll: () => [{ name: cookieName, value: 'old-session' }], set: (name: string, value: string, options: Cookie['options']) => writes.push({ name, value, options }) }) },
    '@supabase/ssr': { createServerClient: (_url: string, _key: string, settings: any) => ({ auth: {
      getUser: async () => {
        settings.cookies.setAll([{ name: cookieName, value: result.error ? '' : 'fresh-session', options: { path: '/', ...(result.error ? { maxAge: 0 } : {}) } }])
        if (throws) throw new TypeError('fetch failed')
        return result
      },
      getClaims: async () => result,
      signOut: async () => { settings.cookies.setAll([{ name: cookieName, value: '', options: { path: '/', maxAge: 0 } }]); return { error: null } },
    } }) },
  })
  return { client: await mod.createClient(), writes }
}

test('server auth readers throw retryable failures before callers can redirect and suppress SDK cookie deletion', async () => {
  for (const error of [temporary, rotated, { name: 'AuthApiError', status: 520 }]) {
    const { client, writes } = await serverFixture({ data: { user: null }, error })
    await assert.rejects(client.auth.getUser(), { name: 'AuthTemporarilyUnavailableError', status: 503 })
    await assert.rejects(client.auth.getClaims(), { name: 'AuthTemporarilyUnavailableError', status: 503 })
    assert.deepEqual(writes, [])
  }
  const failure = await serverFixture({ data: null, error: temporary }, true)
  await assert.rejects(failure.client.auth.getUser(), { name: 'AuthTemporarilyUnavailableError' })
  assert.deepEqual(failure.writes, [])
})

test('server auth keeps verified identity and cookie rotation, while explicit sign-out still clears cookies', async () => {
  const success = await serverFixture({ data: { user: { id: 'member-a' } }, error: null })
  assert.equal((await success.client.auth.getUser()).data.user.id, 'member-a')
  assert.equal(success.writes[0]?.value, 'fresh-session')
  await success.client.auth.signOut()
  assert.equal(success.writes[1]?.options?.maxAge, 0)
  const invalid = await serverFixture({ data: { user: null }, error: { name: 'AuthApiError', status: 401, code: 'bad_jwt' } })
  assert.equal((await invalid.client.auth.getUser()).data.user, null)
  assert.deepEqual(invalid.writes, [])
})

test('account API distinguishes outage from sign-out without profile reads on failed verification', async () => {
  for (const [error, status] of [[temporary, 503], [rotated, 503], [null, 401], [{ status: 401, code: 'bad_jwt' }, 401]] as const) {
    let profileReads = 0
    const mod = await compiled('app/api/account/me/route.ts', {
      '@/lib/supabase/server': { createClient: async () => ({ auth: { getClaims: async () => ({ data: null, error }) } }) },
      '@/lib/supabase/admin': { createAdminClient: () => { profileReads++; throw new Error('Should not read profile') } },
      '@/lib/supabase/userColumns': { PRIVATE_ACCOUNT_COLUMNS: 'id' }, '@/lib/safeApiError': {},
    })
    const response = await mod.GET() as Response
    assert.equal(response.status, status)
    assert.equal(profileReads, 0)
    assert.match(response.headers.get('cache-control') ?? '', /no-store/)
  }
})

test('tier gates distinguish unavailable membership from a verified free account', async () => {
  for (const [authError, dbError, status] of [[temporary, null, 503], [null, { code: 'PGRST002' }, 503], [null, null, 403]] as const) {
    const client = { auth: { getUser: async () => ({ data: { user: authError ? null : { id: 'member-a' } }, error: authError }) } }
    const mod = await compiled('lib/requireTier.ts', {
      'next/headers': { headers: async () => new Headers() }, '@supabase/supabase-js': { createClient: () => client },
      '@/lib/supabase/server': { createClient: async () => client },
      '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: dbError ? null : { tier: 'free' }, error: dbError }) }) }) }) }) },
      '@slipsurge/core/tiers': { effectiveTier: (tier: string) => tier, hasFullAccessOverride: () => false, hasTierAccess: () => false },
    })
    const gate = await mod.requireTier('ultimate')
    assert.equal(gate.error.status, status)
    const effective = await mod.getEffectiveTier()
    if (status === 503) assert.equal(effective.error.status, 503)
    else assert.equal(effective.tier, 'free')
  }
})

test('member profile outage cannot become a signed-out current user', async () => {
  const mod = await compiled('lib/queries.ts', {
    './supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'member-a' } }, error: null }) } }) },
    './supabase/admin': { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { code: 'PGRST002' } }) }) }) }) }) },
    './supabase/userColumns': { PRIVATE_ACCOUNT_COLUMNS: 'id', PUBLIC_USER_COLUMNS: 'id' },
  })
  await assert.rejects(mod.getCurrentUser(), { name: 'AuthTemporarilyUnavailableError', status: 503 })
})

test('NBA and NFL gates return failed verification before any entitlement or sports input reads', async () => {
  for (const [file, method] of [['lib/paintAccess.ts', 'requirePaintAccess'], ['lib/nflAccess.ts', 'requireNflAccess']]) {
    const mod = await compiled(file, {
      'server-only': {}, '@/lib/nbaAccessPolicy': {}, '@/lib/nflAccessPolicy': {}, '@slipsurge/core/tiers': {},
      '@/lib/requireTier': { resolveAuthedClient: async () => ({ userId: null, error: NextResponse.json({ code: 'AUTH_TEMPORARILY_UNAVAILABLE' }, { status: 503 }), supabase: { from: () => { throw new Error('Read before verification') } } }) },
    })
    const gate = await mod[method]()
    assert.equal(gate.error.status, 503)
    assert.equal((await gate.error.json()).code, 'AUTH_TEMPORARILY_UNAVAILABLE')
  }
})

test('NFL page reaches retry boundary during an outage while genuine access denial remains a 404', async () => {
  for (const status of [503, 401, 403]) {
    let reads = 0
    const mod = await compiled('app/the-sideline/page.tsx', {
      '@/lib/nflAccess': { requireNflAccess: async () => ({ error: NextResponse.json({}, { status }) }) },
      'next/navigation': { notFound: () => { throw new Error('NEXT_NOT_FOUND') } },
      './data': { getSidelineGames: () => { reads++; throw new Error('Read before verification') } },
    }, () => ({}))
    await assert.rejects(mod.default({ searchParams: Promise.resolve({}) }), status === 503 ? { name: 'AuthTemporarilyUnavailableError' } : { message: 'NEXT_NOT_FOUND' })
    assert.equal(reads, 0)
  }
})
