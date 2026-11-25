import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const owner = '0e1b44a4-340f-476b-ab6e-4e69e7454ca8'
const author = 'b909e2a1-e903-4a75-8db4-a131e88dd53b'
const listing = '872929ae-a670-4777-8488-34106f2e3d6b'
const row = { id: listing, author_id: author, title: 'Fixture Matrix', snapshot: { factors: [] } }
const filters: string[] = []
const fixture = {
  allowed: true, blocked: false, published: true,
  admin: {
    from(table: string) {
      return {
        select() { return this },
        eq(key: string, value: string) { filters.push(`${table}.${key}=${value}`); return this },
        async maybeSingle() {
          return { data: table === 'users' ? { id: author, username: 'creator-fixture' } : fixture.published ? row : null, error: null }
        },
      }
    },
  },
}
Object.assign(globalThis, { marketplaceLinkFixture: fixture })
const boundRoute = (methods: string[]) => methods.map(method => `export const ${method} = async () => Response.json({});`).join(' ')
const stubs: Record<string, string> = {
  'next/server': 'export const NextResponse = Response',
  '@/app/api/matrices/route': boundRoute(['GET', 'POST']),
  '@/app/api/matrices/[id]/route': boundRoute(['PATCH', 'DELETE']),
  '@/app/api/matrices/import/route': boundRoute(['POST']),
  '@/app/api/matrix-marketplace/route': boundRoute(['GET', 'POST']),
  '@/app/api/matrix-marketplace/[id]/route': boundRoute(['DELETE']),
  '@/app/api/matrix-marketplace/[id]/import/route': boundRoute(['POST']),
  '@/lib/blocks': 'export const isAccountId = id => /^[a-f0-9-]{36}$/.test(id); export const isBlockedEitherWay = async () => globalThis.marketplaceLinkFixture.blocked;',
  '@/lib/matrixMarketplace': 'export const readMarketplaceSnapshot = value => value;',
  '@/lib/mlbViewerAccess': 'export const canViewMlb = async () => globalThis.marketplaceLinkFixture.allowed;',
  '@/lib/requireTier': `export const requireTier = async () => ({ userId: '${owner}' });`,
  '@/lib/supabase/admin': 'export const createAdminClient = () => globalThis.marketplaceLinkFixture.admin;',
  '@/lib/supabase/nativeAccount': `export const requireNativeAccount = async req =>
    req.headers.get('authorization') === 'Bearer member' ? {supabase: {}, userId: '${owner}'} : {error: Response.json({}, {status: 401})};`,
}
const bundle = await build({
  entryPoints: ['src/app/api/mobile/mlb-matrices/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'marketplace-link-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, arg => Object.hasOwn(stubs, arg.path) ? { path: arg.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, arg => ({ contents: stubs[arg.path] }))
  } }],
})
const module = { exports: {} as typeof import('../src/app/api/mobile/mlb-matrices/route') }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const get = (query: string, authorized = true) => module.exports.GET(new Request(`https://fixture.invalid/api/mobile/mlb-matrices?${query}`, {
  headers: authorized ? { authorization: 'Bearer member' } : {},
}))

test('MLB listing links remain behind the existing member and MLB gates', async () => {
  const route = `op=listing&id=${listing}`
  assert.equal((await get(route, false)).status, 401)
  fixture.allowed = false
  assert.equal((await get(route)).status, 403)
  fixture.allowed = true
  assert.equal((await get(route + '&id=second')).status, 404)
  assert.deepEqual(filters, [])
})

test('exact published listing resolution preserves block state and the existing snapshot', async () => {
  const route = `op=listing&id=${listing}`
  fixture.published = false
  assert.equal((await get(route)).status, 404)
  fixture.published = true
  fixture.blocked = true
  assert.equal((await get(route)).status, 404)
  assert.equal(filters.some(filter => filter.startsWith('users.')), false)
  fixture.blocked = false
  const result = await get(route)
  assert.equal(result.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual((await result.json()).listing, { ...row, author: { id: author, username: 'creator-fixture' }, is_owner: false })
  assert.ok(filters.includes(`matrix_marketplace_listings.id=${listing}`))
  assert.ok(filters.includes('matrix_marketplace_listings.status=published'))
})
