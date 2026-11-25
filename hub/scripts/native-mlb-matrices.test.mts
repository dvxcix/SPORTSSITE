import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { build } from 'esbuild'

const id = 'af16326a-b8df-4cc7-ab4e-cdebe3089dc2'
const version = '2026-11-25T08:00:00.123456+00:00'
const handler = (method: string, label: string) => `export async function ${method}(request, context) {
  const id = context ? (await context.params).id : null;
  const body = request?.method === 'POST' ? await request.json() : null;
  globalThis.matrixNativeFixture.calls.push({ method: '${label}', id, body });
  return Response.json({ok: true})
}`
const sources: Record<string, string> = {
  '@/lib/supabase/nativeAccount': `export async function requireNativeAccount(request) {
    if (request.headers.get('authorization') !== 'Bearer figure') return {error: Response.json({}, {status: 401})};
    return {userId: 'member', supabase: {from(table) { if(table !== 'matrices') throw new Error('wrong table');
      return {select() { return this}, eq(field, value) { if(field === 'user_id' && value !== 'member') throw new Error('wrong account');
        return this}, maybeSingle() { return { data: globalThis.matrixNativeFixture.current } }}}
    }}
  }`,
  '@/lib/requireTier': `export async function requireTier(floor) {
    if (floor !== 'ultimate') throw new Error('wrong tier');
    return globalThis.matrixNativeFixture.tier ? {userId: 'member'} : {error: Response.json({}, {status: 403})}
  }`,
  '@/lib/mlbViewerAccess': 'export async function canViewMlb() { return globalThis.matrixNativeFixture.mlb }',
  '@/lib/blocks': `export function isAccountId(value) { return value === '${id}' }
    export async function isBlockedEitherWay() { return globalThis.matrixNativeFixture.blocked }`,
  '@/lib/supabase/admin': `export function createAdminClient() { return { from(table) { return {
    select() { return this }, eq() { return this }, maybeSingle() {
      const fixture = globalThis.matrixNativeFixture;
      if (table !== 'matrix_marketplace_listings' && table !== 'users') throw Error('wrong table');
      return { data: table === 'matrix_marketplace_listings' ? fixture.listing : { id: 'author', username: 'fixture-author' } };
    }
  } } } }`,
  '@/app/api/matrices/route': handler('GET', 'list') + handler('POST', 'create'),
  '@/app/api/matrices/[id]/route': handler('PATCH', 'edit') + handler('DELETE', 'delete'),
  '@/app/api/matrices/import/route': handler('POST', 'import-code'),
  '@/app/api/matrix-marketplace/route': handler('GET', 'marketplace') + handler('POST', 'publish'),
  '@/app/api/matrix-marketplace/[id]/route': handler('DELETE', 'remove-listing'),
  '@/app/api/matrix-marketplace/[id]/import/route': handler('POST', 'import-listing'),
}
const output = await build({
  entryPoints: ['src/app/api/mobile/mlb-matrices/route.ts'], bundle: true, write: false, format: 'cjs', platform: 'node', tsconfig: 'tsconfig.json', external: ['next/server'],
  plugins: [{ name: 'matrix-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => args.path in sources ? { path: args.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: sources[args.path], loader: 'js' }))
  } }],
})
const moduleFixture = { exports: {} as typeof import('../src/app/api/mobile/mlb-matrices/route') }
new Function('require', 'exports', 'module', output.outputFiles[0].text)(createRequire(import.meta.url), moduleFixture.exports, moduleFixture)
const { GET, POST } = moduleFixture.exports
const endpoint = 'https://slipsurge.invalid/api/mobile/mlb-matrices'

test('native MLB Matrix routes require the verified member, MLB visibility, Ultimate, and the saved version', async () => {
  const fixture: { tier: boolean; mlb: boolean; current: { updated_at: string } | null; blocked: boolean; listing: unknown; calls: unknown[] } = {
    tier: true, mlb: true, current: { updated_at: version }, blocked: false, listing: null, calls: [],
  }
  Object.assign(globalThis, { matrixNativeFixture: fixture })
  const read = (op: string, signed = true) => GET(new Request(`${endpoint}?op=${op}`, { headers: signed ? { authorization: 'Bearer figure' } : {} }))
  const write = (op: string, raw: unknown, expected = version) => POST(new Request(
    `${endpoint}?${new URLSearchParams({ op, id, updatedAt: expected })}`,
    { method: 'POST', body: JSON.stringify(raw), headers: { authorization: 'Bearer figure' } },
  ))
  assert.equal((await read('list', false)).status, 401)
  fixture.mlb = false
  assert.equal((await read('list')).status, 403)
  fixture.mlb = true
  fixture.tier = false
  assert.equal((await write('create', {})).status, 403)
  assert.deepEqual(fixture.calls, [])
  fixture.tier = true
  const list = await read('marketplace')
  assert.equal(list.status, 200)
  assert.equal(list.headers.get('cache-control'), 'private, no-store')
  assert.equal((await write('edit', {}, '2026-11-23T08:00:00Z')).status, 409)
  const draft = { matrix_type: 'pipeline', pipeline_steps: [{ kind: 'unless', condition_steps: [{ kind: 'filter', field_key: 'mm',
    operator: 'mm_trend', mm_base_window: 'l1', mm_compare_windows: ['l3', 'l10'] }], then_steps: [{ kind: 'rank', field_key: 'mm_move',
      tolerance: 0.1, zero_eligible: true, book: 'fanduel' }] }] }
  assert.equal((await write('edit', draft)).status, 200)
  assert.deepEqual(fixture.calls.at(-1), { method: 'edit', id, body: draft })
  assert.equal((await write('import-listing', {})).status, 200)
  assert.deepEqual(fixture.calls.at(-1), { method: 'import-listing', id, body: {} })
  fixture.current = null
  assert.equal((await write('delete', {})).status, 404)
  fixture.listing = { id, author_id: 'author', snapshot: { version: 1, name: 'Fixture', color: '#123456', element_code: 'ABC',
    matrix_type: 'classic', factors: [{ field_key: 'hr' }], pipeline_steps: [] } }
  const exact = await read(`listing&id=${id}`)
  assert.equal(exact.status, 200)
  assert.equal((await exact.json()).listing.author.username, 'fixture-author')
  fixture.blocked = true
  assert.equal((await read(`listing&id=${id}`)).status, 404)
})

test('iOS Matrix picker carries all canonical website field identities', () => {
  const web = readFileSync('src/components/dugout/CustomMatrixPanel.tsx', 'utf8')
  const ios = readFileSync('../ios/SlipSurge/Research/DugoutMatrixCatalog.swift', 'utf8')
  for (const name of ['ODDS_FIELDS', 'STAT_FIELDS', 'SAVANT_FIELDS', 'DUGOUT_SPECS_FIELDS', 'PICKS_FIELDS']) {
    const definition = web.match(new RegExp(`const ${name}[^\\n]+ = \\[\\n([\\s\\S]*?)\\n\\]`))?.[1] ?? ''
    const entries = [...definition.matchAll(/\{ key: '([^']+)', label: '([^']+)'/g)]
    assert.ok(entries.length >= 8, name)
    for (const [, key, label] of entries) assert.ok(ios.includes(`.init(id: "${key}", label: "${label}"`), `${name} ${key}`)
  }
})
