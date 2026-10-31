import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as favorites from '../src/lib/sportFavorites.ts'

const mlb = { mlb_id: 123, name: 'Saved Player', team: 'ATL' }
const nfl = { sport: 'nfl' as const, player_id: '00-0033873', name: 'Football Player', team: 'ATL', headshot: null, team_logo: null }
const nba = { sport: 'nba' as const, player_id: '123', name: 'Basketball Player', team: 'ATL', headshot: null, team_logo: null }
const catalog = [...favorites.MLB_FAVORITE_TEAMS, { key: 'NFL:ATL', sport: 'nfl' as const, id: 'ATL', abbr: 'ATL', name: 'Falcons', logo: null, href: '/nfl/teams/ATL' }]
const source = await readFile(new URL('../src/app/api/account/onboarding/route.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText

function fixture(profile: Record<string, unknown>, hibernating = true) {
  let saved: Record<string, unknown> | null = null
  const admin = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }), update: (value: Record<string, unknown>) => ({ eq: async () => { saved = value; return { error: null } } }) }) }
  const imports: Record<string, unknown> = {
    'next/server': { NextResponse: { json: (body: unknown, options?: { status?: number }) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) } }) },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/sportFavorites': favorites,
    '@/lib/favoriteCatalog': { getFavoriteCatalog: async () => catalog },
    '@/lib/mlbOffseason': { MLB_HIBERNATING: hibernating },
    '@/lib/safeApiError': { safeApiError: () => ({ status: 500 }) },
  }
  const mod = { exports: {} as { POST: (request: Request) => Promise<{ status: number }> } }
  new Function('require', 'exports', 'module', compiled)((key: string) => { assert.ok(key in imports, key); return imports[key] }, mod.exports, mod)
  return { post: (value: unknown) => mod.exports.POST(new Request('https://example.com/api/account/onboarding', { method: 'POST', body: JSON.stringify(value) })), saved: () => saved }
}
const profile = { id: 'owner', account_type: 'user', favorite_teams: ['ATL', 'MLB:NYY'], favorite_players: [mlb, nfl], favorite_sports: ['MLB', 'NFL'], notification_settings: { dm: true }, interest_settings: {} }

test('member onboarding preserves legacy MLB favorites while saving other leagues', async () => {
  const f = fixture(profile)
  const response = await f.post({ sports: ['NFL', 'NBA'], teams: ['NFL:ATL'], favoritePlayers: [{ ...mlb, name: 'Changed' }, nfl, nba] })
  assert.equal(response.status, 200)
  const saved = f.saved()!
  assert.deepEqual(saved.favorite_sports, ['NFL', 'NBA', 'MLB'])
  assert.deepEqual(saved.favorite_teams, ['NFL:ATL', 'ATL', 'MLB:NYY'])
  assert.deepEqual(saved.favorite_players, [mlb, nfl, nba])
})

test('member onboarding rejects new MLB sport, team or player without modifying data', async () => {
  for (const body of [
    { sports: ['MLB'] },
    { teams: ['MLB:BOS'] },
    { favoritePlayers: [{ ...mlb, mlb_id: 999 }] },
  ]) {
    const f = fixture(body.sports ? { ...profile, favorite_sports: ['NFL'] } : profile)
    assert.equal((await f.post(body)).status, 403)
    assert.equal(f.saved(), null)
  }
})

test('admins and reactivated members retain ordinary three-sport onboarding', async () => {
  for (const [role, hibernating] of [['admin', true], ['user', false]] as const) {
    const f = fixture({ ...profile, account_type: role }, hibernating)
    assert.equal((await f.post({ sports: ['MLB', 'NFL'], teams: ['MLB:BOS', 'NFL:ATL'], favoritePlayers: [mlb, nfl] })).status, 200)
    assert.deepEqual(f.saved()!.favorite_teams, ['MLB:BOS', 'NFL:ATL'])
  }
})
