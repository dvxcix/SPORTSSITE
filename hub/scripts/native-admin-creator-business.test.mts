import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const owner = '1b97cf41-3e8e-4443-a534-cbdb81f84900'
const changes: unknown[] = []
const fixture = {
  serviceReads: 0,
  browser: { type: 'admin', currentLevel: 'aal2' },
  admin: {
    from() { fixture.serviceReads++; return this }, select() { return this }, eq() { return this }, order() { return this }, limit() { return this },
    update(value: unknown) { changes.push(value); return this },
    async maybeSingle() { return { data: { creator_id: owner } } },
    then(resolve: (value: unknown) => void) { resolve({ data: [{ creator_id: owner }] }) },
  },
}
Object.assign(globalThis, { nativeAdminCreatorBusinessFixture: fixture })
const stubs: Record<string, string> = {
  'server-only': '',
  'next/server': 'export const NextResponse = Response;',
  './supabase/server': `export const createClient = async () => ({auth: {
    getUser: async () => ({data:{user:{id:'browser'}}}), mfa:{getAuthenticatorAssuranceLevel:async () => ({data:{nextLevel:'aal2',currentLevel:globalThis.nativeAdminCreatorBusinessFixture.browser.currentLevel}})}},
    from: () => ({select(){return this},eq(){return this},async single(){return {data:{account_type:globalThis.nativeAdminCreatorBusinessFixture.browser.type}}}})
  });`,
  './supabase/admin': 'export const createAdminClient = () => globalThis.nativeAdminCreatorBusinessFixture.admin;',
  './supabase/adminDecisionActor': `export const adminDecisionActor = async req => {
    const token = req.headers.get('authorization');
    if (token === 'Bearer ok') return {user:{id:'native'},admin:globalThis.nativeAdminCreatorBusinessFixture.admin};
    return {error:Response.json({error:'Forbidden'}, {status: token === 'Bearer basic' ? 403 : 401})};
  };`,
  '@/lib/creatorOperations': 'export const getCreatorOperations = async () => ({creators:[],groups:[],offers:[],members:[],events:[]});',
  '@/lib/adminAudit': 'export const writeAdminAudit = async () => null;',
  '@/lib/serverRateLimit': 'export const consumeServerRateLimit = async () => ({available:true,allowed:true});',
}

async function route<T>(entry: string) {
  const bundle = await build({
    entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{ name: 'admin-creator-fixture', setup(plugin) {
      plugin.onResolve({ filter: /.*/ }, arg => Object.hasOwn(stubs, arg.path) ? { path: arg.path, namespace: 'fixture' } : undefined)
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, arg => ({ contents: stubs[arg.path] }))
    } }],
  })
  const module = { exports: {} as T }
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
  return module.exports
}

const directory = await route<typeof import('../src/app/api/mobile/admin/creator-business/route')>('src/app/api/mobile/admin/creator-business/route.ts')
const auth = await route<typeof import('../src/lib/creatorAdminAuth')>('src/lib/creatorAdminAuth.ts')
const promotions = await route<typeof import('../src/app/api/admin/creators/promotions/route')>('src/app/api/admin/creators/promotions/route.ts')
const site = 'https://fixture.invalid'
const directoryRequest = (token?: string) => new Request(`${site}/api/mobile/admin/creator-business`, {
  headers: token ? { authorization: `Bearer ${token}` } : {},
})

test('creator operations require an administrator verified through the existing session checks', async () => {
  assert.equal((await directory.GET(directoryRequest())).status, 401)
  assert.equal((await directory.GET(directoryRequest('basic'))).status, 403)
  assert.equal(fixture.serviceReads, 0)
  const result = await directory.GET(directoryRequest('ok'))
  assert.equal(result.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual((await result.json()).promotions, [{ creator_id: owner }])
  assert.equal(fixture.serviceReads, 1)
  fixture.browser.currentLevel = 'aal1'
  const insufficient = await auth.creatorAdminAuth(new Request(site))
  assert.equal('status' in insufficient && insufficient.status, 403)
  fixture.browser.currentLevel = 'aal2'
  const verified = await auth.creatorAdminAuth(new Request(site))
  assert.equal('user' in verified && verified.user?.id, 'browser')
  const noFallback = await auth.creatorAdminAuth(directoryRequest('invalid'))
  assert.equal('status' in noFallback && noFallback.status, 401)
})

test('browser promotions keep the origin check and native promotions require verified admin bearer', async () => {
  const request = (headers: Record<string, string> = {}) => Object.assign(new Request(`${site}/api/admin/creators/promotions`, {
    method: 'POST', headers, body: JSON.stringify({ creatorId: owner, featured: true, rank: 4 }),
  }), { nextUrl: new URL(site) }) as Parameters<typeof promotions.POST>[0]
  assert.equal((await promotions.POST(request())).status, 403)
  assert.equal((await promotions.POST(request({ origin: 'https://other.invalid' }))).status, 403)
  assert.equal((await promotions.POST(request({ authorization: 'Bearer basic' }))).status, 403)
  assert.deepEqual(changes, [])
  assert.equal((await promotions.POST(request({ authorization: 'Bearer ok' }))).status, 200)
  assert.equal((await promotions.POST(request({ origin: site }))).status, 200)
  assert.deepEqual(changes.map(change => ({ ...(change as object), updated_at: null })), [
    { featured: true, featured_rank: 4, updated_at: null }, { featured: true, featured_rank: 4, updated_at: null },
  ])
})
