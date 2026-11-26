import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

type Context = { user_id: string; path: string; page_title: string; scroll_y: number; updated_at: string }
const original = '2026-11-25T14:03:11.000Z'
const store = new Map<string, Context>([['member', {
  user_id: 'member', path: '/feed?filter=picks', page_title: 'Feed · Picks', scroll_y: 1326, updated_at: original,
}]])
const fixture = {
  query() {
    let owner = '', expected: string | undefined, changes: Partial<Context> = {}, operation = 'read'
    return {
      select() { return this },
      insert(input: Context) { operation = 'insert'; owner = input.user_id; changes = input; return this },
      update(input: Context) { operation = 'update'; changes = input; return this },
      eq(key: string, value: string) { if (key === 'user_id') owner = value; else expected = value; return this },
      async maybeSingle() {
        const saved = store.get(owner)
        if (operation === 'read') return { data: saved ?? null }
        if (operation === 'insert' && saved) return { data: null, error: { code: '23505' } }
        if (operation === 'update' && saved?.updated_at !== expected) return { data: null }
        const record = { ...saved, ...changes, user_id: owner } as Context
        store.set(owner, record)
        return { data: record }
      },
    }
  },
}
Object.assign(globalThis, { nativeResumeFixture: fixture })
const stubs: Record<string, string> = {
  'next/server': 'export const NextResponse = Response;',
  '@/lib/supabase/nativeAccount': `export const requireNativeAccount = async req => {
    const actor = req.headers.get('authorization')?.split(' ')[1]
    return actor ? { userId: actor, supabase: { from: () => globalThis.nativeResumeFixture.query() } }
      : { error: Response.json({error:'Unauthorized'}, {status:401}) }
  };`,
}
const bundle = await build({
  entryPoints: ['src/app/api/mobile/resume/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'resume-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, arg => Object.hasOwn(stubs, arg.path) ? { path: arg.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, arg => ({ contents: stubs[arg.path] }))
  } }],
})
const module = { exports: {} as typeof import('../src/app/api/mobile/resume/route') }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const endpoint = 'https://fixture.invalid/api/mobile/resume'
const read = (user?: string) => module.exports.GET(new Request(endpoint, { headers: user ? { authorization: 'Bearer ' + user } : {} }))
const write = (body: object, user = 'member') => module.exports.POST(new Request(endpoint, {
  method: 'POST', headers: { authorization: 'Bearer ' + user }, body: JSON.stringify(body),
}))

test('native Resume reads only the signed account’s existing web session and scroll offset', async () => {
  assert.equal((await read()).status, 401)
  assert.deepEqual(await (await read('other')).json(), { saved: null, version: null })
  const payload = await (await read('member')).json()
  assert.equal(payload.saved.path, '/feed?filter=picks')
  assert.equal(payload.saved.scroll_y, 1326)
  assert.equal(payload.version, original)
})

test('native Resume rejects private URLs and leaves a racing browser write intact', async () => {
  const draft = { pageTitle: 'The Court', scrollY: 0 }
  for (const path of ['//example.com/feed', '/admin/discord', '/%61uth/settings', '/feed?checkout_id=x', '/feed#access_token=x']) {
    assert.equal((await write({ ...draft, path })).status, 400)
  }
  const path = '/the-paint?date=2026-11-24&game=21718181&view=odds'
  assert.equal((await write({ ...draft, path })).status, 409)
  const result = await write({ ...draft, path, expectedVersion: original })
  assert.equal(result.status, 200)
  const saved = await result.json()
  assert.equal(saved.saved.path, path)
  assert.notEqual(saved.version, original)
  assert.equal((await write({ ...draft, path: '/feed', expectedVersion: original })).status, 409)
  assert.equal((await (await read('member')).json()).saved.path, path)
})

test('native Resume retains a Feed post anchor and the web-compatible scroll offset together', async () => {
  const path = '/feed?filter=picks&iosPost=ca33e20a-e874-42b8-9ff8-dd6e964dd082'
  const response = await write({ path, pageTitle: 'Feed · Picks', scrollY: 1326 }, 'another-member')
  assert.equal(response.status, 200)
  const record = await (await read('another-member')).json()
  assert.equal(record.saved.path, path)
  assert.equal(record.saved.scroll_y, 1326)
})

test('native Resume round-trips NBA and NFL Odds Board filters including a different inner matchup', async () => {
  const selections = [
    { route: 'the-paint', game: '21718181', innerGame: '21718182', mode: '&mode=live', market: 'points_first3min', book: 'draftkings' },
    { route: 'the-sideline', game: '2026_12_CHI_DET', innerGame: '2026_12_PHI_DAL', mode: '', market: 'receiving_receptions', book: 'fanduel' },
  ]
  for (const { route, game, innerGame, mode, market, book } of selections) {
    const filters = Buffer.from(JSON.stringify({ game: innerGame, search: 'Amon-Ra', target: 4.5, sortedPriceLine: 4.5,
      ascendingPrice: true, ascendingName: false, comparison: 'earlier' })).toString('base64url')
    const path = `/${route}?date=2026-11-26&game=${game}&view=odds-board${mode}&market=${market}&book=${book}&iosFilters=${filters}`
    const response = await write({ path, pageTitle: 'Odds Board', scrollY: 0 }, route)
    assert.equal(response.status, 200)
    assert.equal((await (await read(route)).json()).saved.path, path)
  }
})
