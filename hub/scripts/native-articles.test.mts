import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const author = '044cb383-5807-4e31-9167-8b0d7c44735c'
const article = '5ffb8269-6a5b-4762-bbfe-f76de342cf6c'
const mocks: Record<string, string> = {
  '@/lib/supabase/nativeAccount': `export async function requireNativeAccount(request) {
    return request.headers.get('authorization') === 'Bearer writer'
      ? {userId: '${author}', supabase: globalThis.articleFixture.client}
      : {error: Response.json({}, {status: 401})}
  }`,
  '@/lib/requireTier': `export async function requireVerifiedUserTier(user, level) {
    if (user !== '${author}' || level !== 'basic') throw Error('Expected the verified Basic actor');
    return globalThis.articleFixture.free ? {error: Response.json({}, {status: 403})} : {userId: user}
  }`,
  '@/lib/featureFlags.server': 'export async function isFeatureEnabledServer() { return globalThis.articleFixture.enabled }',
  '@/lib/supabase/admin': 'export const createAdminClient = () => globalThis.articleFixture.service',
}
const code = await build({
  stdin: { contents: "export * from './src/app/api/mobile/articles/route'", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', write: false, format: 'cjs', tsconfig: 'tsconfig.json', external: ['next/server'],
  plugins: [{ name: 'native-article-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js' }))
  } }],
})
const fixture = { exports: {} as typeof import('../src/app/api/mobile/articles/route') }
new Function('require', 'exports', 'module', code.outputFiles[0].text)(createRequire(import.meta.url), fixture.exports, fixture)
const { GET, POST } = fixture.exports
const request = (query: string, data?: unknown, authenticated = true) => new Request(`https://fixture.invalid/api/mobile/articles${query}`, {
  method: data === undefined ? 'GET' : 'POST', headers: authenticated ? { authorization: 'Bearer writer' } : {},
  body: data === undefined ? undefined : JSON.stringify(data),
})

test('article availability follows verified Basic membership and rollout', async () => {
  const state = { enabled: true, free: true, client: {from() { throw Error('Unexpected article query') } } }
  Object.assign(globalThis, {articleFixture: state})
  assert.deepEqual(await (await GET(request('?view=access', undefined, false))).json(), {enabled: false})
  assert.equal((await GET(request('', undefined, false))).status, 401)
  assert.equal((await GET(request('?view=mine'))).status, 403)
  assert.deepEqual(await (await GET(request('?view=access'))).json(), {enabled: false})
  assert.equal((await POST(request('', {action: 'view', id: article}))).status, 403)
  state.free = false
  assert.deepEqual(await (await GET(request('?view=access'))).json(), {enabled: true})
  state.enabled = false
  assert.equal((await POST(request('', {action: 'like', id: article, liked: true}))).status, 403)
})

test('owner writes have stable draft IDs, exact replay and a compare-and-swap revision', async () => {
  let stored: Record<string, unknown> | null = null
  let editedRevision: unknown
  const revision = '2026-11-25T11:20:00+00:00'
  Object.assign(globalThis, {articleFixture: { enabled: true, client: {from(table: string) {
    assert.equal(table, 'blogs')
    let values: Record<string, unknown>
    let editing = false
    const filters: Record<string, unknown> = {}
    return {
      select() { return this }, insert(input: Record<string, unknown>) { values = input; return this },
      update(input: Record<string, unknown>) { values = input; editing = true; return this },
      eq(key: string, value: unknown) { filters[key] = value; return this },
      async single() {
        if (stored) return {error: {code: '23505'}}
        assert.equal(values.author_id, author)
        assert.equal(values.id, article)
        stored = {...values, updated_at: revision}
        return {data: {id: article, slug: values.slug, status: values.status, updated_at: revision}}
      },
      async maybeSingle() {
        assert.equal(filters.id, article)
        assert.equal(filters.author_id, author)
        if (editing) { editedRevision = filters.updated_at; return {data: null} }
        return {data: stored}
      },
    }
  } } }})
  const draft = {id: article, action: 'create', title: 'Matchup review', excerpt: '', content: '# Setup', category: 'Analysis', sport: 'NBA', cover: '', status: 'draft'}
  assert.equal((await POST(request('', {...draft, cover: 'javascript:alert(1)'}))).status, 400)
  const response = await POST(request('', {...draft, author_id: article}))
  assert.equal(response.status, 201)
  assert.equal((await response.json()).slug, `matchup-review-${article}`)
  assert.equal((await POST(request('', draft))).status, 200)
  assert.equal((await POST(request('', {...draft, title: 'Different article'}))).status, 409)
  assert.equal((await POST(request('', {...draft, action: 'edit', updatedAt: revision}))).status, 409)
  assert.equal(editedRevision, revision)
})

test('article views and likes require a published row and use the signed actor', async () => {
  let published = false
  let writes = 0
  Object.assign(globalThis, {articleFixture: {enabled: true, client: {from(table: string) {
    assert.equal(table, 'blogs')
    return {select() { return this }, eq() { return this }, async maybeSingle() { return {data: published ? {id: article} : null} }}
  }}, service: {async rpc(name: string, input: unknown) {
    assert.equal(name, 'set_native_blog_like')
    assert.deepEqual(input, {p_blog_id: article, p_user_id: author, p_liked: true})
    writes += 1
    return {data: {liked: true, count: 1}}
  }}}})
  const action = {action: 'like', id: article, user_id: article, liked: true}
  assert.equal((await POST(request('', action))).status, 404)
  assert.equal(writes, 0)
  published = true
  assert.deepEqual(await (await POST(request('', action))).json(), {liked: true, count: 1})
  assert.equal(writes, 1)
})
