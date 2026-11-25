import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const rows = new Map<string, string | null>()
const audits: Array<{ action: string; targetId: string; details?: unknown }> = []
let failRead = false
const table = (name: string) => {
  assert.equal(name, 'site_settings')
  return {
    select(columns: string) {
      return {
        in(column: string, keys: string[]) {
          assert.equal(columns, 'key,value')
          assert.equal(column, 'key')
          return { data: keys.filter(key => rows.has(key)).map(key => ({ key, value: rows.get(key) })) }
        },
        eq(column: string, key: string) {
          assert.equal(columns, 'value')
          assert.deepEqual([column, key], ['key', 'allow_registration'])
          return { maybeSingle: () => failRead ? { error: 'unavailable' } : { data: rows.has(key) ? { value: rows.get(key) } : null } }
        },
      }
    },
  }
}
const fixture = {
  supabase: {
    from: table,
    rpc(name: string, args: { setting_key: string; had_row: boolean; previous_value: string | null; new_value: string }) {
      assert.equal(name, 'save_native_platform_setting')
      const { setting_key, had_row, previous_value, new_value } = args
      if (rows.has(setting_key) !== had_row || (rows.get(setting_key) ?? null) !== previous_value) return { data: false }
      rows.set(setting_key, new_value)
      return { data: true }
    },
  },
  audits,
}
Object.assign(globalThis, { nativeSettingsFixture: fixture })
const stubs: Record<string, string> = {
  'next/server': 'export const NextResponse = Response;',
  'server-only': '',
  '@/lib/supabase/adminDecisionActor': `export const adminDecisionActor = async req => {
    const token = req.headers.get('authorization');
    if (token === 'Bearer admin') return { supabase: globalThis.nativeSettingsFixture.supabase, user: {id: 'fixture-admin'} };
    return { error: Response.json({ error: 'Denied' }, { status: token ? 403 : 401 }) };
  };`,
  '@/lib/supabase/server': 'export const createClient = async () => globalThis.nativeSettingsFixture.supabase;',
  '@/lib/nativeAuthHandoff': 'export const nativeHandoffKey = () => new Uint8Array(32);',
  '@/lib/nativeInformationPages': 'export const nativeInformationPage = () => null;',
  '@/lib/adminAudit': 'export const writeAdminAudit = async (_, entry) => globalThis.nativeSettingsFixture.audits.push(entry);',
}

async function fixtureModule<T>(entry: string) {
  const bundle = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{ name: 'native-settings-fixture', setup(plugin) {
      plugin.onResolve({ filter: /.*/ }, arg => Object.hasOwn(stubs, arg.path) ? { path: arg.path, namespace: 'fixture' } : undefined)
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, arg => ({ contents: stubs[arg.path] }))
    } }],
  })
  const unit = { exports: {} as T }
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), unit, unit.exports)
  return unit.exports
}

const [settings, information] = await Promise.all([
  fixtureModule<typeof import('../src/app/api/mobile/admin/platform-settings/route')>('src/app/api/mobile/admin/platform-settings/route.ts'),
  fixtureModule<typeof import('../src/app/api/mobile/information/route')>('src/app/api/mobile/information/route.ts'),
])
const request = (page: string, role = 'admin') => new Request(`https://fixture.invalid?page=${page}`, {
  headers: role ? { authorization: `Bearer ${role}` } : {},
})
const save = (body: object, role = 'admin') => settings.POST(new Request('https://fixture.invalid', {
  method: 'POST', headers: role ? { authorization: `Bearer ${role}` } : {}, body: JSON.stringify(body),
}))

test('guest registration follows the site toggle without caching, and provides the visible sports and artwork', async () => {
  const publicStatus = () => information.GET(request('registration', ''))
  const open = await publicStatus()
  assert.equal(open.headers.get('cache-control'), 'private, no-store')
  const status = await open.json()
  assert.equal(status.open, true)
  assert.equal(status.sports.find((sport: { id: string }) => sport.id === 'NFL').logo, 'https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png')
  rows.set('allow_registration', 'false')
  assert.equal((await (await publicStatus()).json()).open, false)
  failRead = true
  assert.equal((await publicStatus()).status, 503)
  failRead = false
  rows.delete('allow_registration')
})

test('platform reads enforce admin role and keep private code separate from readiness and general settings', async () => {
  rows.set('custom_css', 'body { color: red; }')
  assert.equal((await settings.GET(request('code', ''))).status, 401)
  assert.equal((await settings.GET(request('login', 'member'))).status, 403)
  const general = await settings.GET(request('general'))
  assert.equal(general.headers.get('cache-control'), 'private, no-store')
  assert.doesNotMatch(await general.text(), /body \{/)
  assert.deepEqual((await (await settings.GET(request('login'))).json()).login, {
    handoffReady: true, providers: ['whop', 'discord', 'x'],
  })
  assert.equal((await (await settings.GET(request('code'))).json()).fields[0].stored, rows.get('custom_css'))
  assert.equal((await settings.GET(request('invalid'))).status, 400)
  rows.delete('custom_css')
})

test('edits reject arbitrary fields and stale values, distinguish null from absence, and omit code from audit', async () => {
  const snippet = '\n  :root { --variable: "\\p\\"; }\n'
  const edit = { key: 'custom_css', present: true, stored: null, value: snippet }
  assert.equal((await save(edit, '')).status, 401)
  assert.equal((await save(edit, 'member')).status, 403)
  assert.equal((await save({ ...edit, key: 'feature_marketplace' })).status, 400)
  assert.equal((await save({ ...edit, key: 'allow_registration', value: 'on' })).status, 400)
  assert.equal((await save({ ...edit, value: 'x'.repeat(65_537) })).status, 400)
  assert.equal((await save(edit)).status, 409)
  rows.set('custom_css', null)
  assert.deepEqual(await (await save(edit)).json(), { stored: snippet })
  assert.equal((await save(edit)).status, 409)
  assert.equal(rows.get('custom_css'), snippet)
  assert.deepEqual(audits.map(({ action, targetId, details }) => [action, targetId, details]), [
    ['platform_setting_update', 'custom_css', undefined],
  ])
})
