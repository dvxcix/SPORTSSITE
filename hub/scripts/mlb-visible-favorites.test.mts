import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { visibleFavorites } from '../src/lib/visibleFavorites.ts'
import * as favorites from '../src/lib/sportFavorites.ts'

const baseball = { mlb_id: 123, name: 'Baseball player', team: 'ATL' }
const football = { sport: 'nfl' as const, player_id: '123', name: 'Football player', team: 'ATL' }
const original = { id: 'owner', account_type: 'user', favorite_sports: ['MLB', 'NFL'], sport_preferences: ['MLB', 'NBA'], favorite_teams: ['ATL', 'MLB:NYY', 'NFL:ATL', 'NBA:1'], favorite_players: [baseball, football] }

test('member profile payload hides MLB without mutating stored data; admin retains everything', () => {
  const shown = visibleFavorites(original, false)
  assert.deepEqual(shown.favorite_sports, ['NFL'])
  assert.deepEqual(shown.sport_preferences, ['NBA'])
  assert.deepEqual(shown.favorite_teams, ['NFL:ATL', 'NBA:1'])
  assert.deepEqual(shown.favorite_players, [football])
  assert.deepEqual(original.favorite_teams, ['ATL', 'MLB:NYY', 'NFL:ATL', 'NBA:1'])
  assert.deepEqual(visibleFavorites(original, true), original)
  assert.deepEqual(visibleFavorites({ ...original, favorite_sports: ['NFL'], favorite_teams: ['ATL'] }, false).favorite_teams, ['ATL'])
})

test('account response redacts favorites for members, preserves auth fields and grants admin access', async () => {
  const input = await readFile(new URL('../src/app/api/account/me/route.ts', import.meta.url), 'utf8')
  const code = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  for (const role of ['user', 'admin']) {
    const profile = { ...original, account_type: role, username: 'owner' }
    const imports: Record<string, unknown> = {
      'next/server': { NextResponse: { json: (body: unknown) => body } },
      '@/lib/supabase/server': { createClient: async () => ({ auth: { getClaims: async () => ({ data: { claims: { sub: 'owner' } }, error: null }) } }) },
      '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }) }) }) },
      '@/lib/supabase/userColumns': { PRIVATE_ACCOUNT_COLUMNS: '*' },
      '@/lib/safeApiError': { safeApiError: () => null },
      '@/lib/supabase/authErrors': { AUTH_UNAVAILABLE_HEADERS: {}, isRetryableAuthError: () => false },
      '@/lib/mlbOffseason': { MLB_HIBERNATING: true },
      '@/lib/visibleFavorites': { visibleFavorites },
    }
    const mod = { exports: {} as { GET: () => Promise<{ profile: typeof original & { username: string } }> } }
    new Function('require', 'exports', 'module', code)((key: string) => { assert.ok(key in imports, key); return imports[key] }, mod.exports, mod)
    const response = await mod.exports.GET()
    assert.equal(response.profile.id, 'owner')
    assert.equal(response.profile.username, 'owner')
    assert.equal(response.profile.account_type, role)
    assert.deepEqual(response.profile.favorite_teams, role === 'admin' ? original.favorite_teams : ['NFL:ATL', 'NBA:1'])
    assert.deepEqual(response.profile.favorite_players, role === 'admin' ? original.favorite_players : [football])
  }
})

const source = await readFile(new URL('../src/app/api/account/favorites/route.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const nflTeam = { key: 'NFL:ATL', sport: 'nfl', id: 'ATL', abbr: 'ATL', name: 'Falcons', logo: null, href: '/nfl/teams/ATL' }
function fixture(role = 'user', initialSports = original.favorite_sports) {
  let stored = { ...original, account_type: role, favorite_sports: initialSports }
  const admin = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: stored, error: null }) }) }), update: (value: Partial<typeof stored>) => ({ eq: async () => { stored = { ...stored, ...value }; return { error: null } } }) }) }
  const imports: Record<string, unknown> = {
    'next/server': { NextResponse: { json: (body: unknown, options?: { status?: number }) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/requireTier': { resolveAuthedClient: async () => ({ userId: 'owner' }) },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/sportFavorites': favorites,
    '@/lib/favoriteCatalog': { getFavoriteCatalog: async () => [...favorites.MLB_FAVORITE_TEAMS, nflTeam] },
    '@/lib/mlbOffseason': { MLB_HIBERNATING: true },
    '@/lib/safeApiError': { safeApiError: () => ({ status: 500 }) },
  }
  const mod = { exports: {} as { PATCH: (request: Request) => Promise<{ status: number }> } }
  new Function('require', 'exports', 'module', compiled)((key: string) => { assert.ok(key in imports, key); return imports[key] }, mod.exports, mod)
  return { patch: (body: unknown) => mod.exports.PATCH(new Request('https://example.com/api/account/favorites', { method: 'PATCH', body: JSON.stringify(body) })), current: () => stored }
}

test('member repeated edits retain existing hidden MLB and reject adding it', async () => {
  const f = fixture()
  for (const sports of [['NFL', 'NBA'], ['NBA']]) {
    assert.equal((await f.patch({ sports, teams: ['NFL:ATL'], players: [football] })).status, 200)
    assert.deepEqual(f.current().favorite_sports, [...sports, 'MLB'])
    assert.deepEqual(f.current().favorite_teams, ['NFL:ATL', 'ATL', 'MLB:NYY'])
    assert.deepEqual(f.current().favorite_players.map(favorites.favoritePlayerSport), ['mlb', 'nfl'])
  }
  const noMlb = fixture('user', ['NFL'])
  assert.equal((await noMlb.patch({ sports: ['MLB', 'NFL'] })).status, 403)
  assert.deepEqual(noMlb.current().favorite_sports, ['NFL'])
  // Admin can remove MLB; an ordinary account without MLB cannot add it.
  const admin = fixture('admin')
  assert.equal((await admin.patch({ sports: ['NFL'] })).status, 200)
  assert.deepEqual(admin.current().favorite_sports, ['NFL'])
  const legacy = fixture('user', ['MLB', 'NFL', 'Legacy sport'])
  assert.equal((await legacy.patch({ sports: ['NFL', 'Legacy sport'] })).status, 200)
  assert.deepEqual(legacy.current().favorite_sports, ['NFL', 'Legacy sport', 'MLB'])
  assert.equal((await legacy.patch({ sports: ['NFL', 'invented'] })).status, 400)
})
