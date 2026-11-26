import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const calls: unknown[] = []
const local = { calls, signedIn: true, hasTier: true, rows: [] as object[] }
Object.assign(globalThis, { nativeNotificationsFixture: local })
const stubs: Record<string, string> = {
  '@/lib/requireTier': `export async function requireTier(tier) {
    const fixture = globalThis.nativeNotificationsFixture
    fixture.calls.push(['tier', tier])
    return fixture.hasTier ? {userId:'self'} : { error: Response.json({}, {status:403}) }
  }`,
  '@/lib/blocks': 'export async function getBlockedEitherWayIds() { return ["00000000-0000-4000-8000-000000000010"] }',
  '@/lib/supabase/nativeAccount': `
    export async function requireNativeAccount() {
      const fixture = globalThis.nativeNotificationsFixture
      if (!fixture.signedIn) return {error:Response.json({}, {status:401})}
      return { userId:'self', supabase: { from(table) {
        fixture.calls.push(['table',table])
        const query = new Proxy({}, { get(_, method) {
          if (method === 'then') return resolve => resolve({data:fixture.rows,error:null})
          return (...args) => { fixture.calls.push([method,...args]); return query }
        } })
        return query
      } } }
    }`,
}
const bundle = await build({
  stdin: { contents: 'export * from "./src/app/api/mobile/notifications/route"', resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'cjs', platform: 'node', tsconfig: 'tsconfig.json',
  external: ['next/server'],
  plugins: [{ name: 'native-notice-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'js' }))
  } }],
})
const route = { exports: {} as typeof import('../src/app/api/mobile/notifications/route') }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, route, route.exports)
const id = '00000000-0000-4000-8000-000000000001'
const url = 'https://slipsurge.invalid/api/mobile/notifications'
const write = (method: 'PATCH' | 'DELETE', body: unknown) => route.exports[method](new Request(url, {
  method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}))

test('native notifications enforce a verified, eligible account and filter to its own inbox', async () => {
  local.signedIn = false
  assert.equal((await route.exports.GET(new Request(url))).status, 401)
  assert.deepEqual(calls, [])
  local.signedIn = true
  local.hasTier = false
  assert.equal((await route.exports.GET(new Request(url))).status, 403)
  assert.deepEqual(calls, [['tier', 'basic']])
  local.hasTier = true
  calls.length = 0
  assert.equal((await route.exports.GET(new Request(url))).status, 200)
  assert.deepEqual(calls.find(entry => Array.isArray(entry) && entry[0] === 'eq'), ['eq', 'user_id', 'self'])
  assert.deepEqual(calls.find(entry => Array.isArray(entry) && entry[0] === 'or'), [
    'or', 'actor_id.is.null,actor_id.not.in.(00000000-0000-4000-8000-000000000010)',
  ])
})

test('native read and delete mutations reject invalid selections and never use a caller-supplied owner', async () => {
  calls.length = 0
  assert.equal((await write('DELETE', { ids: [] })).status, 400)
  assert.equal((await write('DELETE', { clearAll: true, userId: 'other' })).status, 400)
  assert.equal((await write('PATCH', { clearAll: true })).status, 400)
  assert.ok(!calls.some(entry => Array.isArray(entry) && entry[0] === 'table'))
  calls.length = 0
  assert.equal((await write('PATCH', { ids: [id, id] })).status, 200)
  assert.deepEqual(calls.slice(-3), [['update', { read: true }], ['eq', 'user_id', 'self'], ['in', 'id', [id]]])
  calls.length = 0
  assert.equal((await write('DELETE', { clearAll: true })).status, 200)
  assert.deepEqual(calls.slice(-2), [['delete'], ['eq', 'user_id', 'self']])
})

test('native sports notices expose only vetted public artwork from system rows', async () => {
  local.rows = [
    { type: 'lineup_confirmed', actor_id: null, artwork: 'https://www.mlbstatic.com/team-logos/112.svg' },
    { type: 'pick_result', actor_id: null, artwork: 'https://a.espncdn.com/i/headshots/nfl/players/full/1.png' },
    { type: 'pick_result', actor_id: 'other', artwork: 'https://a.espncdn.com/i/headshots/nfl/players/full/1.png' },
    { type: 'pick_result', actor_id: null, artwork: 'https://a.espncdn.com.example.invalid/i/headshots/nfl/players/full/1.png' },
  ]
  try {
    const response = await route.exports.GET(new Request(url))
    assert.equal(response.status, 200)
    const { notifications } = await response.json()
    assert.deepEqual(notifications.map((row: { artwork_url: string | null }) => row.artwork_url), [
      'https://a.espncdn.com/i/teamlogos/mlb/500/chc.png',
      'https://a.espncdn.com/i/headshots/nfl/players/full/1.png',
      null,
      null,
    ])
    assert.ok(notifications.every((row: object) => !Object.hasOwn(row, 'artwork')))
  } finally {
    local.rows = []
  }
})
