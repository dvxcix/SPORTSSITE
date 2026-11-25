import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

test('profile appearance retains legacy books and applies only the changes based on the observed row', async () => {
  const edits: Array<{ fields: Record<string, unknown>; filters: [string, unknown][] }> = []
  let stale = false
  const client = { from(table: string) {
    assert.equal(table, 'users')
    return { update(fields: Record<string, unknown>) {
      const filters: [string, unknown][] = []
      edits.push({ fields, filters })
      return {
        eq(column: string, expected: unknown) { filters.push([column, expected]); return this },
        select() { return this },
        maybeSingle() { return { data: stale ? null : { id: 'fixture-account' }, error: null } },
      }
    } }
  } }
  Object.assign(globalThis, { nativeProfileAppearanceFixture: client })
  const stubs: Record<string, string> = {
    'next/server': 'export const NextResponse = Response;',
    'server-only': '',
    '@/lib/supabase/admin': 'export const createAdminClient = () => { throw Error("Unexpected privileged write"); };',
    '@/lib/supabase/nativeAccount': `export const requireNativeAccount = async req => req.headers.get('authorization') === 'Bearer fixture'
      ? { supabase: globalThis.nativeProfileAppearanceFixture, userId: 'fixture-account' }
      : { error: Response.json({}, {status:401}) };`,
  }
  const output = await build({ entryPoints: ['src/app/api/mobile/account/settings/route.ts'], bundle: true, write: false,
    platform: 'node', format: 'cjs', plugins: [{ name: 'native-profile-appearance-fixture', setup(plugin) {
      plugin.onResolve({ filter: /.*/ }, args => Object.hasOwn(stubs, args.path) ? { path: args.path, namespace: 'fixture' } : undefined)
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path] }))
    } }],
  })
  const module = { exports: {} as typeof import('../src/app/api/mobile/account/settings/route') }
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
  const patch = (body: object, authorized = true) => module.exports.PATCH(new Request('https://fixture.invalid', {
    method: 'PATCH', headers: authorized ? { authorization: 'Bearer fixture' } : {},
    body: JSON.stringify({ kind: 'profile', displayName: 'Fixture', bio: '', location: '', website: '', ...body }),
  }))
  assert.equal((await patch({}, false)).status, 401)
  assert.equal((await patch({ avatarRingStyle: { before: 'surge', value: 'deco:unknown' } })).status, 400)
  assert.equal((await patch({ avatarRingColor: { before: '#b6ff3b', value: 'not hexadecimal' } })).status, 400)
  assert.equal((await patch({ sportsbooks: { before: [], value: ['not a listed sportsbook'] } })).status, 400)
  assert.equal(edits.length, 0)
  assert.equal((await patch({})).status, 200, 'the older app leaves appearance untouched')
  assert.doesNotMatch(JSON.stringify(edits[0].fields), /avatar_ring_|sportsbooks/)
  const saved = {
    avatarRingStyle: { before: 'surge', value: 'deco:fb-spiral' },
    avatarRingColor: { before: '#b6ff3b', value: '#39d9ff' },
    sportsbooks: { before: ['pinnacle', 'legacy"book'], value: ['legacy"book', 'fanduel'] },
  }
  assert.equal((await patch(saved)).status, 200)
  assert.deepEqual(edits[1].filters, [['id', 'fixture-account'], ['avatar_ring_style', 'surge'], ['avatar_ring_color', '#b6ff3b'],
    ['sportsbooks', '{"pinnacle","legacy\\"book"}']])
  assert.deepEqual(edits[1].fields.sportsbooks, ['legacy"book', 'fanduel'])
  stale = true
  assert.equal((await patch(saved)).status, 409)
})
