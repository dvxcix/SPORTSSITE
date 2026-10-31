import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { visibleFavorites } from '../src/lib/visibleFavorites.ts'
import { FAVORITE_USER_COLUMNS, PRIVATE_ACCOUNT_COLUMNS, PUBLIC_USER_COLUMNS } from '../src/lib/supabase/userColumns.ts'

const source = await readFile(new URL('../src/lib/queries.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const mixed = { sport_preferences: ['MLB', 'NFL'], favorite_sports: ['MLB', 'NFL'], favorite_teams: ['MLB:NYY', 'NFL:ATL'], favorite_players: [{ mlb_id: 7, name: 'Baseball', team: 'NYY' }, { sport: 'nfl', player_id: '1', name: 'Football', team: 'ATL' }] }

function fixture(options: { exists?: boolean; admin?: boolean; favoriteError?: boolean } = {}) {
  const calls: string[] = []
  const imports: Record<string, unknown> = {
    './supabase/server': { createClient: async () => ({
      from: () => ({ select: (columns: string) => { calls.push(`base:${columns}`); return { eq: () => ({ single: async () => ({ data: options.exists === false ? null : { id: 'profile-id', username: 'member' } }) }) } } }),
      auth: { getUser: async () => ({ data: { user: options.admin ? { id: 'admin-id' } : null } }) },
    }) },
    './supabase/admin': { createAdminClient: () => ({ from: () => ({ select: (columns: string) => { calls.push(`favorite:${columns}`); return { eq: (key: string, id: string) => { calls.push(`${key}:${id}`); return { maybeSingle: async () => ({ data: options.favoriteError ? null : mixed, error: options.favoriteError ? new Error('unavailable') : null }) } } } } }) }) },
    './supabase/userColumns': { PUBLIC_USER_COLUMNS, PRIVATE_ACCOUNT_COLUMNS, FAVORITE_USER_COLUMNS },
    './visibleFavorites': { visibleFavorites },
    './mlbViewerAccess': { canViewMlb: async (_client: unknown, id: string | undefined) => id === 'admin-id' },
    './supabase/authErrors': { AuthTemporarilyUnavailableError: class extends Error {} },
  }
  const mod = { exports: {} as { getUserProfile: (username: string) => Promise<{ id: string; favorite_teams: unknown; favorite_sports: unknown; favorite_players: unknown } | null> } }
  new Function('require', 'exports', 'module', code)((key: string) => { assert.ok(key in imports, key); return imports[key] }, mod.exports, mod)
  return { get: mod.exports.getUserProfile, calls }
}

test('base profile uses caller-scoped fields and mixed-sport data is filtered for members', async () => {
  const f = fixture()
  const profile = await f.get('member')
  assert.ok(profile)
  assert.equal(f.calls[0], `base:${PUBLIC_USER_COLUMNS}`)
  assert.ok(!PUBLIC_USER_COLUMNS.includes('favorite_teams'))
  assert.ok(PRIVATE_ACCOUNT_COLUMNS.includes('favorite_teams'))
  assert.deepEqual(profile.favorite_teams, ['NFL:ATL'])
  assert.deepEqual(profile.favorite_sports, ['NFL'])
  assert.deepEqual(profile.favorite_players, [mixed.favorite_players[1]])
  assert.ok(f.calls.includes('id:profile-id'))
})

test('admin receives stored favorites; absent base profile never invokes service query', async () => {
  const admin = await fixture({ admin: true }).get('member')
  assert.ok(admin)
  assert.deepEqual(admin.favorite_teams, mixed.favorite_teams)
  const absent = fixture({ exists: false })
  assert.equal(await absent.get('member'), null)
  assert.equal(absent.calls.length, 1)
})

test('an inaccessible favorites query fails rather than inventing an empty profile', async () => {
  await assert.rejects(fixture({ favoriteError: true }).get('member'), /temporarily unavailable/)
})
