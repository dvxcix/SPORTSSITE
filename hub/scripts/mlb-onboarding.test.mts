import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as favorites from '../src/lib/sportFavorites.ts'
import { onboardingBaseline } from '../src/lib/onboardingBaseline.ts'

const mlb = { mlb_id: 123, name: 'Saved Player', team: 'ATL' }
const nfl = { sport: 'nfl' as const, player_id: '00-0033873', name: 'Football Player', team: 'ATL', headshot: null, team_logo: null }
const nba = { sport: 'nba' as const, player_id: '123', name: 'Basketball Player', team: 'ATL', headshot: null, team_logo: null }
const catalog = [...favorites.MLB_FAVORITE_TEAMS, { key: 'NFL:ATL', sport: 'nfl' as const, id: 'ATL', abbr: 'ATL', name: 'Falcons', logo: null, href: '/nfl/teams/ATL' }]
const source = await readFile(new URL('../src/app/api/account/onboarding/route.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText

function fixture(profile: Record<string, unknown>, hibernating = true, conflict = false) {
  let saved: Record<string, unknown> | null = null
  const admin = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }) }),
    rpc: async (name: string, args: { p_user_id: string; p_expected: Record<string, unknown>; p_changes: Record<string, unknown> }) => {
      assert.equal(name, 'save_account_onboarding'); assert.equal(args.p_user_id, 'owner')
      assert.deepEqual(args.p_expected, { favorite_teams: profile.favorite_teams ?? null, favorite_players: profile.favorite_players ?? null, favorite_sports: profile.favorite_sports ?? null, interest_settings: profile.interest_settings ?? null, notification_settings: profile.notification_settings ?? null, display_name: profile.display_name ?? null, bio: profile.bio ?? null, avatar_url: profile.avatar_url ?? null, banner_url: profile.banner_url ?? null, is_private: profile.is_private ?? null, hide_win_rate: profile.hide_win_rate ?? null, onboarding_completed_at: profile.onboarding_completed_at ?? null })
      if (conflict) return { data: false, error: null }
      saved = args.p_changes; return { data: true, error: null }
    },
  }
  const imports: Record<string, unknown> = {
    'next/server': { NextResponse: { json: (body: unknown, options?: { status?: number }) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) } }) },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/sportFavorites': favorites,
    '@/lib/favoriteCatalog': { getFavoriteCatalog: async () => catalog },
    '@/lib/mlbOffseason': { MLB_HIBERNATING: hibernating },
    '@/lib/safeApiError': { safeApiError: () => ({ status: 500 }) },
    '@/lib/onboardingBaseline': { onboardingBaseline },
  }
  const mod = { exports: {} as { POST: (request: Request) => Promise<{ status: number }> } }
  new Function('require', 'exports', 'module', compiled)((key: string) => { assert.ok(key in imports, key); return imports[key] }, mod.exports, mod)
  const baseline = onboardingBaseline('owner', profile)
  return { post: (value: Record<string, unknown>) => mod.exports.POST(new Request('https://example.com/api/account/onboarding', { method: 'POST', body: JSON.stringify({ initialBaseline: baseline, ...value }) })), saved: () => saved }
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

test('stale onboarding conflicts instead of overwriting a concurrent preference change', async () => {
  const f = fixture(profile, true, true)
  assert.equal((await f.post({ sports: ['NFL'], teams: ['NFL:ATL'], favoritePlayers: [nfl] })).status, 409)
  assert.equal(f.saved(), null)
})

test('a form opened before a privacy change cannot restore its old privacy choices', async () => {
  const account: Record<string, unknown> = { ...profile, is_private: false, hide_win_rate: false }
  const f = fixture(account)
  account.is_private = true
  account.hide_win_rate = true
  assert.equal((await f.post({ isPrivate: false, hideWinRate: false })).status, 409)
  assert.equal(f.saved(), null)
})

test('legacy non-object preference state is not silently discarded', async () => {
  for (const field of ['notification_settings', 'interest_settings']) {
    const f = fixture({ ...profile, [field]: ['legacy'] })
    assert.equal((await f.post({ sports: ['NFL'] })).status, 409)
    assert.equal(f.saved(), null)
  }
})
