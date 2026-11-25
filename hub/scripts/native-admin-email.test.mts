import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const sends: { to: string; idempotencyKey: string }[] = []
const audits: object[] = []
Object.assign(globalThis, { nativeEmailFixture: { sends, audits } })
const stubs: Record<string, string> = {
  'next/server': 'export const NextResponse = Response;',
  'server-only': '',
  '@/lib/supabase/adminDecisionActor': `export const adminDecisionActor = async req => {
    const token = req.headers.get('authorization');
    if (token === 'Bearer admin') return { user: { id: 'fixture-account', email: 'owner@example.invalid' } };
    return { error: Response.json({error:'Denied'}, {status:token ? 403 : 401}) };
  };`,
  '@/lib/supabase/admin': 'export const createAdminClient = () => ({});',
  '@/lib/supabase/server': `export const createClient = () => { throw Error('Unexpected browser session'); };`,
  '@/lib/adminAudit': 'export const writeAdminAudit = async (_, item) => globalThis.nativeEmailFixture.audits.push(item);',
  '@/lib/email': `export const brandedEmailHtml = value => '<h1>' + value.heading + '</h1>';
    export const sendEmailWithResult = async value => { globalThis.nativeEmailFixture.sends.push(value); return {ok:true,status:200}; };`,
}
async function fixtureModule<T>(entry: string) {
  const bundle = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{ name: 'native-email-fixture', setup(plugin) {
      plugin.onResolve({ filter: /.*/ }, arg => Object.hasOwn(stubs, arg.path) ? { path: arg.path, namespace: 'fixture' } : undefined)
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, arg => ({ contents: stubs[arg.path] }))
    } }],
  })
  const unit = { exports: {} as T }
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), unit, unit.exports)
  return unit.exports
}
const [read, send] = await Promise.all([
  fixtureModule<typeof import('../src/app/api/mobile/admin/email/route')>('src/app/api/mobile/admin/email/route.ts'),
  fixtureModule<typeof import('../src/app/api/admin/email/test/route')>('src/app/api/admin/email/test/route.ts'),
])

test('native email previews use the shared template and require admin access', async () => {
  const request = (template: string, authorization = '') => new Request(`https://fixture.invalid?template=${template}`, {
    headers: authorization ? { authorization } : {},
  })
  assert.equal((await read.GET(request('billing'))).status, 401)
  assert.equal((await read.GET(request('billing', 'Bearer member'))).status, 403)
  assert.equal((await read.GET(request('constructor', 'Bearer admin'))).status, 400)
  const allowed = await read.GET(request('billing', 'Bearer admin'))
  assert.equal(allowed.headers.get('cache-control'), 'private, no-store')
  assert.match((await allowed.json()).html, /Your membership needs attention/)
})

test('native delivery test ignores external recipients and keeps a stable retry key', async () => {
  const request = (authorization: string, key = '') => new Request('https://fixture.invalid', { method: 'POST',
    headers: { authorization, 'idempotency-key': key }, body: JSON.stringify({ to: 'unexpected@example.invalid' }),
  })
  assert.equal((await send.POST(request('Bearer member'))).status, 403)
  assert.equal((await send.POST(request('Bearer admin'))).status, 400)
  const key = 'ca33e20a-e874-42b8-9ff8-dd6e964dd082'
  assert.equal((await send.POST(request('Bearer admin', key))).status, 200)
  assert.equal((await send.POST(request('Bearer admin', key.toUpperCase()))).status, 200)
  assert.deepEqual(sends.map(({ to, idempotencyKey }) => [to, idempotencyKey]),
    Array(2).fill(['owner@example.invalid', 'admin-email-test/fixture-account/' + key]))
  assert.equal(audits.length, 2)
})
