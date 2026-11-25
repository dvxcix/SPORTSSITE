import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const id = 'af16326a-b8df-4cc7-ab4e-cdebe3089dc2'
const stubs: Record<string, string> = {
  'server-only': '',
  './server': 'export async function createClient() { globalThis.adminMemberFixture.cookieReads++; return globalThis.adminMemberFixture.cookies }',
  './adminDecisionActor': `export async function adminDecisionActor(request) {
    const fixture = globalThis.adminMemberFixture
    fixture.nativeReads++
    return request.headers.get('authorization') === 'Bearer ready'
      ? { user: {id: '${id}'}, admin: fixture.admin } : {error: Response.json({}, {status: 403})}
  }`,
  '@/lib/supabase/adminDecisionActor': `export async function adminDecisionActor(request) {
    const fixture = globalThis.adminMemberFixture
    if (request.headers.get('authorization') !== 'Bearer ready') return {error: Response.json({}, {status: 403})}
    return { user: {id: '${id}'}, admin: fixture.admin, supabase: fixture.supabase }
  }`,
  '@/lib/blocks': `export function isAccountId(value) { return value === '${id}' }`,
  '@/lib/supabase/admin': 'export const createAdminClient = () => globalThis.adminMemberFixture.admin',
}
const output = await build({
  stdin: { contents: "export {adminMemberOperator} from './src/lib/supabase/adminMemberOperator'; export {GET} from './src/app/api/mobile/admin/members/route'; export {PATCH} from './src/app/api/admin/feature-rollouts/route'",
    resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'cjs', tsconfig: 'tsconfig.json',
  external: ['next/server'], plugins: [{ name: 'admin-member-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'js' }))
  } }],
})
const fixtureModule = { exports: {} as typeof import('../src/lib/supabase/adminMemberOperator') & typeof import('../src/app/api/mobile/admin/members/route')
  & Pick<typeof import('../src/app/api/admin/feature-rollouts/route'), 'PATCH'> }
new Function('require', 'exports', 'module', output.outputFiles[0].text)(require, fixtureModule.exports, fixtureModule)
const { GET, PATCH, adminMemberOperator } = fixtureModule.exports

test('native privileged actions do not fall back to a browser session with an invalid bearer', async () => {
  const fixture = { cookieReads: 0, nativeReads: 0, cookies: { auth: { getUser: async () => ({ data: { user: { id } } }) },
    from() { return this }, select() { return this }, eq() { return this }, maybeSingle: async () => ({ data: { account_type: 'admin' } }) } }
  Object.assign(globalThis, { adminMemberFixture: fixture })
  const url = 'https://slipsurge.invalid/api/admin/users/manage'
  assert.equal((await adminMemberOperator(new Request(url, { headers: { authorization: 'Bearer stale' } }))).error?.status, 403)
  assert.equal(fixture.nativeReads, 1)
  assert.equal(fixture.cookieReads, 0)
  assert.equal((await adminMemberOperator(new Request(url, { headers: { authorization: 'Bearer ready' } }))).adminId, id)
  assert.equal((await adminMemberOperator(new Request(url))).adminId, id)
  assert.equal(fixture.cookieReads, 1)
})

test('native member detail exposes subscription and account status only after admin access', async () => {
  const row = { id, username: 'member', email: 'fixture@slipsurge.invalid', account_type: 'user', tier: 'free', admin_granted_tier: 'ultimate',
    verified_identities: { discord: { provider_user_id: 'fixture-provider-subject' } }, whop_user_id: 'fixture-whop-id' }
  let privilegedReads = 0
  const fixture = { admin: {
    auth: { admin: { getUserById: async () => ({ data: { user: { email_confirmed_at: '2026-11-25', banned_until: null } } }) } },
    from(table: string) { assert.equal(table, 'users'); privilegedReads++; return this },
    select() { return this }, eq(field: string, value: string) { assert.equal(field, 'id'); assert.equal(value, id); return this },
    async maybeSingle() { return { data: row } },
  } }
  Object.assign(globalThis, { adminMemberFixture: fixture })
  const url = `https://slipsurge.invalid/api/mobile/admin/members?id=${id}`
  assert.equal((await GET(new Request(url))).status, 401)
  assert.equal((await GET(new Request(url, { headers: { authorization: 'Bearer stale' } }))).status, 403)
  assert.equal(privilegedReads, 0)
  const response = await GET(new Request(url, { headers: { authorization: 'Bearer ready' } }))
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  const body = await response.json()
  assert.equal(body.member.effectiveTier, 'ultimate')
  assert.equal(body.member.emailVerified, true)
  assert.deepEqual(body.member.connections, { discord: true, x: false, whop: true })
  assert.doesNotMatch(JSON.stringify(body), /fixture-provider-subject|fixture-whop-id/)
  assert.equal(privilegedReads, 1)
})

test('recent sign-ins use the existing admin scope and return only the directory fields', async () => {
  const now = Date.now()
  const older = 'cf40236a-8277-47a3-ad15-f47c1f482554'
  const newAt = new Date(now - 60_000).toISOString()
  const oldAt = new Date(now - 16 * 60_000).toISOString()
  const directory = [
    { id: older, last_sign_in_at: oldAt, email: 'legacy@example.invalid', phone: 'private-number' },
    { id, last_sign_in_at: newAt, email: 'omitted@example.invalid', phone: 'private-number' },
    { id: 'unused', last_sign_in_at: 'invalid', email: 'unused@example.invalid' },
  ]
  const fixture = {
    admin: { auth: { admin: { listUsers: async ({ perPage }: { perPage: number }) => {
      assert.equal(perPage, 1000)
      return { data: { users: directory } }
    } } } },
    supabase: { from(table: string) {
      assert.equal(table, 'users')
      return { select(columns: string) {
        assert.equal(columns, 'id,username,display_name,avatar_url')
        return { in(key: string, ids: string[]) {
          assert.deepEqual([key, ids], ['id', [id, older]])
          return { data: [{ id, display_name: 'Member', username: 'member', avatar_url: 'https://example.invalid/avatar.png' }] }
        } }
      } }
    } },
  }
  Object.assign(globalThis, { adminMemberFixture: fixture })
  const url = 'https://slipsurge.invalid/api/mobile/admin/members?view=recent'
  assert.equal((await GET(new Request(url))).status, 401)
  assert.equal((await GET(new Request(url, { headers: { authorization: 'Bearer stale' } }))).status, 403)
  const response = await GET(new Request(url, { headers: { authorization: 'Bearer ready' } }))
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  const body = await response.json()
  assert.deepEqual(body.signIns.map((entry: { id: string; lastSignIn: string; recent: boolean }) =>
    [entry.id, entry.lastSignIn, entry.recent]), [[id, newAt, true], [older, oldAt, false]])
  assert.doesNotMatch(JSON.stringify(body), /private-number|omitted@example.invalid|unused@example.invalid/)
})

test('native feature controls require the version that was reviewed before changing a rollout', async () => {
  const version = '2026-11-25T04:00:00.12+00:00'
  let saved = 0
  Object.assign(globalThis, { adminMemberFixture: { admin: {
    from(table: string) {
      assert.equal(table, 'feature_rollouts')
      let expected: string | null = null
      let pending: object | undefined
      return {
        update(payload: object) { pending = payload; return this },
        eq(field: string, value: string) { if (field === 'updated_at') expected = value; return this },
        select() { return this },
        async maybeSingle() {
          if (expected !== version) return { data: null, error: null }
          saved++
          return { data: pending, error: null }
        },
      }
    },
  } } })
  const { NextRequest } = require('next/server')
  const patch = (expected?: string) => PATCH(new NextRequest('https://slipsurge.invalid/api/admin/feature-rollouts', {
    method: 'PATCH', headers: { authorization: 'Bearer ready' },
    body: JSON.stringify({ featureKey: 'feature_blog', audience: 'percentage', rolloutPercent: 23, expectedUpdatedAt: expected }),
  }))
  assert.equal((await patch()).status, 400)
  assert.equal((await patch('2026-11-24T04:00:00Z')).status, 409)
  assert.equal(saved, 0)
  const confirmation = await (await patch(version)).json()
  assert.equal(confirmation.rollout.rollout_percent, 23)
  assert.equal(confirmation.rollout.updated_by, id)
  assert.equal(saved, 1)
})
