import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const owner = '0e1b44a4-340f-476b-ab6e-4e69e7454ca8'
const target = 'b909e2a1-e903-4a75-8db4-a131e88dd53b'
const other = '872929ae-a670-4777-8488-34106f2e3d6b'
const name = { id: target, username: 'test-member', display_name: 'Member' }
const log: unknown[] = []
const fixture = {
  client: {
    from(table: string) {
      return {
        select() { return this },
        eq(field: string, value: string) { log.push([table, field, value]); return this },
        order() { return this },
        async range(start: number, end: number) {
          log.push([table, start, end])
          if (table === 'blocks') {
            return { data: [{ blocked_id: target, person: name, created_at: '2026-11-25' },
              { blocked_id: other, person: null, created_at: '2026-11-24' }], error: null }
          }
          return { data: [{ target_id: target }], error: null }
        },
        delete() { return this },
        async match(values: object) { log.push([table, 'delete', values]); return { error: null } },
        async in(field: string, values: string[]) {
          log.push([table, field, values])
          return { data: [{ ...name }], error: null }
        },
      }
    },
    async rpc(name: string, params: object) { log.push([name, params]); return { error: null } },
  },
}
Object.assign(globalThis, { suppressionFixture: fixture })
const stubs: Record<string, string> = {
  'next/server': 'export const NextResponse = Response',
  '@/lib/supabase/nativeAccount': `export async function requireNativeAccount(request) {
    if (request.headers.get('authorization') === 'Bearer viewer') return { userId: '${owner}', supabase: globalThis.suppressionFixture.client };
    return { error: Response.json({}, { status: 401 }) };
  }`,
}
const bundle = await build({
  entryPoints: ['src/app/api/mobile/account/suppressions/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'native-account-suppressions', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, arg => Object.hasOwn(stubs, arg.path) ? { path: arg.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, arg => ({ contents: stubs[arg.path] }))
  } }],
})
const module = { exports: {} as typeof import('../src/app/api/mobile/account/suppressions/route') }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const { GET, DELETE } = module.exports
const request = (query: string, method = 'GET', authorized = true) => new Request(
  `https://fixture.invalid/api/mobile/account/suppressions?${query}`,
  { method, headers: authorized ? { authorization: 'Bearer viewer' } : {} },
)

test('sign-in and a valid page are required for private account lists', async () => {
  log.length = 0
  assert.equal((await GET(request('kind=blocked', 'GET', false))).status, 401)
  assert.equal((await GET(request('kind=blocked&offset=-10'))).status, 400)
  assert.equal((await GET(request('kind=blocked&kind=muted'))).status, 400)
  assert.deepEqual(log, [])
})

test('private lists bind to the verified viewer and retain hidden identities for exact removal', async () => {
  log.length = 0
  const blocked = await GET(request(`kind=blocked&offset=40&user=${other}`))
  assert.equal(blocked.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(await blocked.json(), {
    people: [{ ...name, restrictedAt: '2026-11-25' }, { id: other, username: null, restrictedAt: '2026-11-24' }],
    nextOffset: null,
  })
  assert.deepEqual(log, [['blocks', 'blocker_id', owner], ['blocks', 40, 80]])
  log.length = 0
  assert.deepEqual(await (await GET(request('kind=muted'))).json(), { people: [name], nextOffset: null })
  assert.deepEqual(log, [['feed_suppressions', 'user_id', owner], ['feed_suppressions', 'target_type', 'author'],
    ['feed_suppressions', 0, 40], ['users', 'id', [target]]])
})

test('unmute deletes only the viewer’s author suppression and unblock uses the original RPC', async () => {
  log.length = 0
  assert.equal((await DELETE(request(`kind=muted&id=${owner}`, 'DELETE'))).status, 400)
  assert.equal((await DELETE(request(`kind=muted&id=${target}`, 'DELETE', false))).status, 401)
  assert.equal((await DELETE(request(`kind=muted&id=${target}&id=${other}`, 'DELETE'))).status, 400)
  assert.deepEqual(log, [])
  assert.deepEqual(await (await DELETE(request(`kind=muted&id=${target}&user=${other}`, 'DELETE'))).json(), { ok: true })
  assert.deepEqual(await (await DELETE(request(`kind=blocked&id=${target}`, 'DELETE'))).json(), { ok: true })
  assert.deepEqual(log, [
    ['feed_suppressions', 'delete', { user_id: owner, target_type: 'author', target_id: target }],
    ['set_account_block', { p_target_id: target, p_blocked: false }],
  ])
})
