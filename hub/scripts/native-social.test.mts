import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const owner = '11111111-1111-4111-8111-111111111111'
const viewer = '22222222-2222-4222-8222-222222222222'
const postId = '33333333-3333-4333-8333-333333333333'
const commentId = '44444444-4444-4444-8444-444444444444'
const normal = { id: postId, author_id: owner, visibility: 'public', group_id: null, is_premium: false, content: 'Pick discussion', sport: 'NBA' }
const fixture = { post: { ...normal }, blocked: [] as string[], writes: [] as string[], shown: false }

const stubs = {
  'next/server': 'export const NextResponse=Response',
  '@/lib/supabase/nativeAccount': `export async function requireNativeAccount(req) {
    if (req.headers.get('authorization') !== 'Bearer fixture') return {error:Response.json({}, {status:401})}
    return {supabase:globalThis.socialClient,userId:"${viewer}"}
  }`,
  '@/lib/blocks': 'export const isAccountId=id=>/^[0-9a-f-]{36}$/.test(id); export const getBlockedEitherWayIds=async()=>globalThis.socialFixture.blocked',
  '@/lib/mlbViewerAccess': 'export const canViewMlb=async()=>false',
  '@/lib/notify': 'export const notify=async()=>undefined',
  '@/lib/mentions': 'export const notifyMentions=async()=>undefined',
  '@/lib/feedQuery': 'export const POST_WITH_AUTHOR="fixture-select"',
  '@/lib/nativeSocial': `
    export function nativeAnonymousClient(){return globalThis.socialClient}
    export function isGuestVisible(post){return post.visibility==="public"&&!post.is_premium&&post.group_id===null}
    export function mobilePost(post){return {id:post.id,content:post.content}}
  `,
  '@/lib/queries': 'export const attachUserReactions=async(p,id,client)=>{if(client!==globalThis.socialClient)throw Error("wrong client");return p}',
  '@/lib/supabase/admin': 'export const createAdminClient=()=>({rpc:async()=>({error:null})})',
  '@/lib/serverRateLimit': 'export const consumeServerRateLimit=async()=>({available:true,allowed:true})',
}
type QueryResult = { data: unknown; error: null }
type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>
class Query implements PromiseLike<QueryResult> {
  write = ''
  filters = new Map<string, unknown>()
  constructor(readonly table: string) {}
  select() { return this }
  eq(key: string, value: unknown) { this.filters.set(key, value); return this }
  match(values: Record<string, unknown>) { Object.entries(values).forEach(([k,v])=>this.filters.set(k,v)); return this }
  order() { return this }
  limit() { return this }
  insert() { this.write = 'insert'; return this }
  update() { this.write = 'update'; return this }
  delete() { this.write = 'delete'; return this }
  maybeSingle() {
    return Promise.resolve({ error: null, data: this.table === 'posts' ? fixture.post : { id: commentId, author_id: owner } })
  }
  then<A, B>(onfulfilled?: ((value: QueryResult) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    if (this.write) fixture.writes.push(`${this.table}:${this.write}`)
    const data = this.table === 'comments' && !this.write ? [{
      id: commentId, content: 'reply', author_id: owner, parent_id: null, created_at: '2026-11-24T00:00:00Z',
      updated_at: null, reaction_count: 2, author: { username: 'analyst', display_name: 'Analyst', avatar_url: null },
    }] : []
    return Promise.resolve<QueryResult>({ data, error: null }).then(onfulfilled, onrejected)
  }
}
Object.assign(globalThis, { socialFixture: fixture, socialClient: { from: (table: string) => new Query(table) } })
const bundle = await build({
  entryPoints: ['src/app/api/mobile/posts/[id]/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'native-social-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path as keyof typeof stubs], loader: 'js' }))
  } }],
})
const moduleFixture = { exports: {} as Record<'GET' | 'POST', Handler> }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, moduleFixture, moduleFixture.exports)

function send(action?: object, member = false) {
  const method = action ? 'POST' : 'GET'
  return moduleFixture.exports[method](new Request('https://slipsurge.invalid/posts/' + postId, {
    method, headers: member ? { authorization: 'Bearer fixture' } : {}, body: action ? JSON.stringify(action) : undefined,
  }), { params: Promise.resolve({ id: postId }) })
}

test('native thread reads keep public guest scope, member block and MLB gates', async () => {
  fixture.post = { ...normal }
  fixture.blocked = []
  const publicThread = await send()
  assert.equal(publicThread.status, 200)
  assert.equal(publicThread.headers.get('cache-control'), 'private, no-store')
  const body = await publicThread.json()
  assert.equal(body.post.id, postId)
  assert.equal(body.comments[0].author.displayName, 'Analyst')
  fixture.post = { ...normal, visibility: 'private' }
  assert.equal((await send()).status, 404)
  fixture.post = { ...normal, is_premium: true }
  assert.equal((await send()).status, 404)
  fixture.post = { ...normal, sport: 'MLB' }
  assert.equal((await send(undefined, true)).status, 404)
  fixture.post = { ...normal }
  fixture.blocked = [owner]
  assert.equal((await send(undefined, true)).status, 404)
})

test('post writes derive the viewer, respect blocks and forbid another author’s comment edit', async () => {
  fixture.post = { ...normal }
  fixture.blocked = []
  fixture.writes = []
  assert.equal((await send({ kind: 'repost', enabled: true })).status, 401)
  assert.equal((await send({ kind: 'comment-edit', id: commentId, text: 'new' }, true)).status, 403)
  assert.equal((await send({ kind: 'post-edit', text: 'not the author' }, true)).status, 403)
  assert.equal((await send({ kind: 'post-delete' }, true)).status, 403)
  assert.equal((await send({ kind: 'post-report', reason: 'unknown report category' }, true)).status, 400)
  assert.equal(fixture.writes.length, 0)
  assert.equal((await send({ kind: 'bookmark', enabled: true }, true)).status, 200)
  assert.deepEqual(fixture.writes, ['bookmarks:insert'])
  fixture.blocked = [owner]
  assert.equal((await send({ kind: 'react', emoji: '❤️', enabled: true }, true)).status, 404)
  assert.deepEqual(fixture.writes, ['bookmarks:insert'])
})
