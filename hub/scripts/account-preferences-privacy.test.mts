import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/app/api/account/preferences/route.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
type Reply = { status: number; body: unknown; headers?: Record<string, string> }

function fixture(options: { userId?: string | null; authError?: Reply; missing?: boolean; writeError?: boolean; currentOverrides?: Record<string, unknown> } = {}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  let current: Record<string, unknown> = { interest_settings: { existing: 'keep' }, notification_settings: { future_alert: true }, notification_delivery_settings: { future_setting: 'keep' }, dugout_column_prefs: { future_option: 'keep' }, ...options.currentOverrides }
  const admin = { rpc: async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args })
    if (options.writeError) return { data: null, error: {} }
    if (options.missing) return { data: false, error: null }
    const changes = args.p_changes as Record<string, Record<string, unknown>>
    const expected = args.p_expected as Record<string, Record<string, unknown> | null>
    for (const field of Object.keys(changes)) {
      if (current[field] !== null && (typeof current[field] !== 'object' || Array.isArray(current[field]))) return { data: false, error: null }
      const existing = current[field] && typeof current[field] === 'object' && !Array.isArray(current[field]) ? current[field] as Record<string, unknown> : {}
      const baseline = expected[field] && typeof expected[field] === 'object' && !Array.isArray(expected[field]) ? expected[field] as Record<string, unknown> : {}
      if (Object.keys(changes[field]).some(key => JSON.stringify(existing[key]) !== JSON.stringify(baseline[key]))) return { data: false, error: null }
    }
    for (const field of Object.keys(changes)) {
      const existing = current[field] && typeof current[field] === 'object' && !Array.isArray(current[field]) ? current[field] as Record<string, unknown> : {}
      current = { ...current, [field]: { ...existing, ...changes[field] } }
    }
    return { data: true, error: null }
  } }
  const imports: Record<string, unknown> = {
    'next/server': { NextResponse: { json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({ status: init?.status ?? 200, body, headers: init?.headers }) } },
    '@/lib/requireTier': { resolveAuthedClient: async () => ({ userId: options.userId === undefined ? 'owner' : options.userId, error: options.authError }) },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/safeApiError': { safeApiError: () => ({ status: 500, headers: { set: () => {} } }) },
  }
  const mod = { exports: {} as { PATCH: (request: Request) => Promise<Reply> } }
  new Function('require', 'exports', 'module', compiled)((key: string) => { assert.ok(key in imports, key); return imports[key] }, mod.exports, mod)
  const patch = (body: unknown, origin = 'https://example.com') => mod.exports.PATCH(new Request('https://example.com/api/account/preferences', { method: 'PATCH', headers: { origin }, body: JSON.stringify(body) }))
  return { patch, calls, current: () => current }
}

const interests = { kind: 'interests', value: { content_mix: ['research', 'picks'], market_focus: ['milestones'], discovery_mode: 'balanced' }, expected: { interest_settings: {} } }
const notifications = { kind: 'notifications', value: { settings: { new_follower: true, dm_email: false }, delivery: { quiet_hours_enabled: true, quiet_start: '22:00', quiet_end: '07:00', timezone: 'Europe/Berlin', live_game_priority: false } }, expected: { notification_settings: {}, notification_delivery_settings: {} } }

test('only verified owner can write and user-supplied account IDs are rejected', async () => {
  const signedOut = fixture({ userId: null })
  assert.equal((await signedOut.patch(interests)).status, 401)
  assert.equal(signedOut.calls.length, 0)
  const unavailable = fixture({ authError: { status: 503, body: null } })
  assert.equal((await unavailable.patch(interests)).status, 503)
  const owner = fixture()
  assert.equal((await owner.patch({ ...interests, userId: 'another-member' })).status, 400)
  assert.equal((await owner.patch(interests, 'https://evil.example')).status, 403)
  assert.equal(owner.calls.length, 0)
})

test('interest and notification changes reach the service-only function once for the verified owner', async () => {
  const f = fixture()
  assert.equal((await f.patch(interests)).status, 200)
  assert.deepEqual(f.current().interest_settings, { existing: 'keep', ...interests.value })
  assert.equal(f.calls[0].name, 'save_account_preferences')
  assert.equal(f.calls[0].args.p_user_id, 'owner')
  assert.equal((await f.patch(notifications)).status, 200)
  assert.deepEqual(f.current().notification_settings, { future_alert: true, ...notifications.value.settings })
  assert.deepEqual(f.current().notification_delivery_settings, { future_setting: 'keep', ...notifications.value.delivery })
})

test('column settings are bounded and other profile fields cannot be changed', async () => {
  const f = fixture()
  assert.equal((await f.patch({ kind: 'dugout-columns', value: { hiddenColumns: ['a'], columnOrder: ['b', 'a'] }, expected: { dugout_column_prefs: {} } })).status, 200)
  assert.deepEqual(f.current().dugout_column_prefs, { future_option: 'keep', hiddenColumns: ['a'], columnOrder: ['b', 'a'] })
  assert.equal((await f.patch({ ...interests, value: { ...interests.value, tier: 'ultimate' } })).status, 400)
  assert.equal((await f.patch({ ...notifications, value: { ...notifications.value, settings: { dm: 'true' } } })).status, 400)
  assert.equal((await f.patch({ kind: 'dugout-columns', value: { hiddenGroups: Array(301).fill('a') }, expected: { dugout_column_prefs: {} } })).status, 400)
  assert.equal((await f.patch({ ...notifications, value: { ...notifications.value, delivery: { ...notifications.value.delivery, timezone: 'not/a-zone' } } })).status, 400)
})

test('a failed or uncertain write is not retried, and stale edits are rejected', async () => {
  const failed = fixture({ writeError: true })
  assert.equal((await failed.patch(interests)).status, 500)
  assert.equal(failed.calls.length, 1)
  assert.equal((await fixture({ missing: true }).patch(interests)).status, 409)
  const stale = fixture({ currentOverrides: { interest_settings: { content_mix: ['community'], existing: 'keep' } } })
  assert.equal((await stale.patch(interests)).status, 409)
  assert.deepEqual(stale.current().interest_settings, { content_mix: ['community'], existing: 'keep' })
})

test('null settings can be initialized while legacy non-object settings remain unchanged', async () => {
  const f = fixture({ currentOverrides: { interest_settings: null } })
  assert.equal((await f.patch(interests)).status, 200)
  assert.deepEqual(f.current().interest_settings, interests.value)
  const legacy = fixture({ currentOverrides: { interest_settings: ['old'] } })
  assert.equal((await legacy.patch(interests)).status, 409)
  assert.deepEqual(legacy.current().interest_settings, ['old'])
})
