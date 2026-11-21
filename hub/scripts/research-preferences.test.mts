import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as preferences from '../src/lib/researchPreferences'
import { safeInternalPath } from '../src/lib/safeRedirect'

const { DEFAULT_RESEARCH_PREFERENCES: defaults, LAUNCH_PAGES, validResearchPreferences, launchDestination, initialResearchBook, preferredBookIds, comparisonBookDefaults } = preferences
const selected = { ...defaults, launchPage: 'court', books: ['draftkings', 'fanduel'], primaryBook: 'draftkings' }

test('private preference contract rejects arbitrary routes, unknown books, duplicates and invalid primary selections', () => {
  assert.equal(validResearchPreferences(defaults), true)
  assert.equal(validResearchPreferences(selected), true)
  for (const invalid of [null, [], {}, { ...selected, user_id: 'other' }, { ...selected, version: 2 }, { ...selected, launchPage: 'https://evil.test' }, { ...selected, launchPage: '/admin' }, { ...selected, books: ['fanduel', 'fanduel'] }, { ...selected, books: ['made-up'] }, { ...selected, primaryBook: 'caesars' }, { ...selected, books: [] }, { ...defaults, primaryBook: 'fanduel' }]) assert.equal(validResearchPreferences(invalid), false, JSON.stringify(invalid))
})

test('every launch option resolves to a fixed internal route, with revocation fallback and no stale game/date', () => {
  assert.equal(new Set(LAUNCH_PAGES.map(page => page.id)).size, LAUNCH_PAGES.length)
  for (const page of LAUNCH_PAGES) {
    const value = { ...defaults, launchPage: page.id }
    assert.ok(validResearchPreferences(value))
    assert.equal(launchDestination(value, { nba: true, nfl: true }), page.href)
    assert.equal(safeInternalPath(page.href), page.href)
    assert.ok(!/[?&](game|date|at|mode=live)=/.test(page.href))
    if (page.group === 'NBA' || page.group === 'NFL') assert.equal(launchDestination(value, { nba: false, nfl: false }), '/feed')
  }
  assert.equal(launchDestination({ ...defaults, launchPage: 'unknown' }, { nba: true, nfl: true }), '/feed')
})

test('explicit book links win, primary seeds single-book tools and multi-book defaults preserve all available choices', () => {
  assert.equal(initialResearchBook('fanduel', selected), 'fanduel')
  assert.equal(initialResearchBook('all', selected), 'all')
  assert.equal(initialResearchBook(null, selected), 'draftkings')
  assert.equal(initialResearchBook('injected', selected), 'draftkings')
  assert.equal(initialResearchBook(null, defaults, 'fanduel'), 'fanduel')
  assert.deepEqual(preferredBookIds(['fanduel', 'draftkings', 'betmgm'], selected.books), ['fanduel', 'draftkings'])
  assert.deepEqual(preferredBookIds(['betmgm'], selected.books), ['betmgm'])
  assert.deepEqual(preferredBookIds(['williamhill_us'], ['caesars']), ['williamhill_us'])
  assert.deepEqual(preferredBookIds([], selected.books), [])
  assert.equal(safeInternalPath(null, '/launch'), '/launch')
  assert.equal(safeInternalPath('//evil.test', '/launch'), '/launch')
  assert.equal(safeInternalPath('/the-paint?view=odds-board', '/launch'), '/the-paint?view=odds-board')
})

test('NBA URL normalization retains preferred comparisons across remounts and shares manual all-book overrides', () => {
  const first = comparisonBookDefaults(null, null, selected)
  assert.deepEqual(first, selected.books)
  const query = new URLSearchParams({ book: 'all', books: first.join(',') })
  assert.deepEqual(comparisonBookDefaults(query.get('books'), query.get('book'), selected), selected.books)
  assert.deepEqual(comparisonBookDefaults('all', 'all', selected), [])
  assert.deepEqual(comparisonBookDefaults(null, 'all', selected), [])
  assert.deepEqual(comparisonBookDefaults('draftkings,fanduel,draftkings', null, selected), ['draftkings', 'fanduel'])
  assert.deepEqual(comparisonBookDefaults('https://evil.test', 'all', selected), [])
})

const compile = async (file: string, imports: Record<string, unknown>) => {
  const source = await readFile(new URL(file, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const mod = { exports: {} as Record<string, (...args: any[]) => any> }
  new Function('require', 'exports', 'module', compiled)((key: string) => { assert.ok(key in imports, `Unmocked ${key}`); return imports[key] }, mod.exports, mod)
  return mod.exports
}

type Reply = { status: number; body: any; headers?: Record<string, string> }
async function routeFixture(options: { user?: string | null; unavailable?: boolean; error?: boolean } = {}) {
  let current = structuredClone(defaults)
  const calls: Array<{ name: string; args: any }> = []
  const route = await compile('../src/app/api/account/preferences/route.ts', {
    'next/server': { NextResponse: { json: (body: any, init?: any): Reply => ({ status: init?.status ?? 200, body, headers: init?.headers }) } },
    '@/lib/requireTier': { resolveAuthedClient: async () => ({ userId: options.user === undefined ? 'verified-owner' : options.user }) },
    '@/lib/supabase/admin': { createAdminClient: () => ({ rpc: async (name: string, args: any) => {
      calls.push({ name, args })
      if (options.error) return { error: { message: 'database unavailable' } }
      if (JSON.stringify(args.p_expected) !== JSON.stringify(current)) return { data: false }
      current = structuredClone(args.p_preferences)
      return { data: true }
    } }) },
    '@/lib/researchPreferences': preferences,
    '@/lib/researchPreferencesServer': { readResearchPreferences: async () => ({ preferences: current, available: !options.unavailable }) },
    '@/lib/safeApiError': { safeApiError: () => ({ status: 500, headers: { set() {} } }) },
  })
  const patch = (body: unknown, origin = 'https://app.test') => route.PATCH(new Request('https://app.test/api/account/preferences', { method: 'PATCH', headers: { origin, 'sec-fetch-site': 'same-origin' }, body: JSON.stringify(body) })) as Promise<Reply>
  return { patch, get: route.GET as () => Promise<Reply>, calls, current: () => current }
}

test('authenticated preferences persist through a fresh read, use only verified ownership and reject stale edits', async () => {
  const f = await routeFixture()
  assert.deepEqual((await f.get()).body.preferences, defaults)
  assert.equal((await f.patch({ kind: 'research', value: selected, expected: defaults })).status, 200)
  assert.deepEqual((await f.get()).body.preferences, selected)
  assert.equal(f.calls[0].name, 'save_member_research_preferences')
  assert.equal(f.calls[0].args.p_user_id, 'verified-owner')
  assert.equal((await f.patch({ kind: 'research', value: defaults, expected: defaults })).status, 409)
  assert.deepEqual(f.current(), selected)
})

test('signed-out, cross-origin, spoofed-owner and invalid writes cannot reach storage', async () => {
  const guest = await routeFixture({ user: null })
  assert.equal((await guest.get()).status, 401)
  assert.equal((await guest.patch({ kind: 'research', value: selected, expected: defaults })).status, 401)
  const f = await routeFixture()
  assert.equal((await f.patch({ kind: 'research', value: selected, expected: defaults }, 'https://evil.test')).status, 403)
  for (const body of [{ kind: 'research', value: selected, expected: defaults, userId: 'other' }, { kind: 'research', value: { ...selected, launchPage: '/admin' }, expected: defaults }, { kind: 'research', value: selected, expected: {} }]) assert.equal((await f.patch(body)).status, 400)
  assert.equal(f.calls.length, 0)
  assert.equal(guest.calls.length, 0)
})

test('private responses are uncached; unavailable reads and uncertain writes are honest and never retried', async () => {
  assert.match((await (await routeFixture()).get()).headers!['Cache-Control'], /private, no-store/)
  assert.equal((await (await routeFixture({ unavailable: true })).get()).status, 503)
  const f = await routeFixture({ error: true })
  assert.equal((await f.patch({ kind: 'research', value: selected, expected: defaults })).status, 500)
  assert.equal(f.calls.length, 1)
})

test('server reads are scoped, tolerate optional defaults outages and recheck launch entitlements', async () => {
  let stored: unknown = selected, failed = false, nba = true, nfl = true
  const ownerFilters: string[] = []
  const server = await compile('../src/lib/researchPreferencesServer.ts', {
    'server-only': {}, './researchPreferences': preferences,
    './nbaAccessPolicy': { NBA_ACCESS_COLUMNS: 'account_type,tier', hasNbaAccess: (data: any) => !!data?.allowed },
    './nflAccess': { requireNflAccess: async () => nfl ? { userId: 'owner' } : { error: { status: 403 } } },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: (table: string) => ({ select: () => ({ eq: (_key: string, owner: string) => {
      ownerFilters.push(owner)
      const query={abortSignal:()=>query,maybeSingle:async()=>table === 'users' ? { data: { allowed: nba } } : { data: stored === undefined ? null : { preferences: stored }, error: failed }};return query
    } }) }) }) },
  })
  assert.equal(await server.memberLaunchDestination('owner'), '/the-paint?view=research')
  nba = false; assert.equal(await server.memberLaunchDestination('owner'), '/feed')
  stored = { ...defaults, launchPage: 'nfl-odds-board' }
  assert.equal(await server.memberLaunchDestination('owner'), '/the-sideline?view=odds-board')
  nfl = false; assert.equal(await server.memberLaunchDestination('owner'), '/feed')
  stored = undefined; assert.deepEqual(await server.readResearchPreferences('owner'), { available: true, preferences: defaults })
  failed = true; assert.equal(await server.memberLaunchDestination('owner'), '/feed')
  failed = false; stored = { ...selected, launchPage: 'https://evil.test' }; assert.equal((await server.readResearchPreferences('owner')).available, false)
  assert.ok(ownerFilters.every(id => id === 'owner'))
})
