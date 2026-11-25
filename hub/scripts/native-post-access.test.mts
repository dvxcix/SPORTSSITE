import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const state = {
  userId: 'author',
  inserts: 0,
  mentions: 0,
  rows: new Map<string, Record<string, unknown>>(),
}
Object.assign(globalThis, { nativePostFixture: state })

const stubs: Record<string, string> = {
  '@/lib/mlbViewerAccess': 'export async function canViewMlb() { return false }',
  '@/lib/mentions': 'export async function notifyMentions() { globalThis.nativePostFixture.mentions++ }',
  '@/lib/supabase/nativeAccount': `
    export async function requireNativeAccount(request) {
      const state = globalThis.nativePostFixture
      if (!request.headers.has('authorization')) return { error: Response.json({}, {status:401}) }
      return { userId: state.userId, supabase: { from() {
        return {
          insert(draft) { return { select() { return { single() {
            if (state.rows.has(draft.id)) return { error: { code: '23505' } }
            state.inserts++
            state.rows.set(draft.id, { ...draft, created_at: new Date().toISOString() })
            return { data: { id: draft.id } }
          } } } } },
          select() { return { eq(_, id) { return { eq(_, actor) { return { maybeSingle() {
            const data = state.rows.get(id)
            return { data: data?.author_id === actor ? data : null }
          } } } } } } }
        }
      } } }
    }`,
}
const bundle = await build({
  stdin: { contents: 'export * from "./src/app/api/mobile/posts/route"', resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'cjs', platform: 'node', tsconfig: 'tsconfig.json',
  external: ['next/server'],
  plugins: [{ name: 'native-post-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'js' }))
  } }],
})
const route = { exports: {} as typeof import('../src/app/api/mobile/posts/route') }
new Function('require','module','exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), route, route.exports)

const draft = {
  id: '00000000-0000-4000-8000-000000000001',
  content: 'Native fixture',
  sport: 'NBA',
  visibility: 'followers',
  kind: 'analysis',
  spoiler: true,
}
const send = (value: object, signed = true) => route.exports.POST(new Request('https://slipsurge.invalid/api/mobile/posts', {
  method: 'POST',
  headers: signed ? { authorization: 'Bearer fixture' } : {},
  body: JSON.stringify(value),
}))

test('native posts keep author, visibility, and replay identity server-bound', async () => {
  assert.equal((await send(draft, false)).status, 401)
  assert.equal((await send({ ...draft, author_id: 'other' })).status, 400)
  assert.equal((await send({ ...draft, sport: 'MLB' })).status, 403)
  assert.equal((await send({ ...draft, kind: 'pick' })).status, 400)
  assert.equal((await send(draft)).status, 201)
  assert.equal(state.rows.get(draft.id)?.author_id, 'author')
  assert.equal(state.rows.get(draft.id)?.visibility, 'followers')
  assert.equal(state.rows.get(draft.id)?.is_spoiler, true)
  assert.equal((await send(draft)).status, 200)
  assert.equal((await send({ ...draft, content: 'edited after write' })).status, 409)
  state.userId = 'different-author'
  assert.equal((await send(draft)).status, 409)
  assert.equal(state.inserts, 1)
  assert.equal(state.mentions, 1)
  state.userId = 'author'
})

test('poll composition uses the website option shape and approved durations', async () => {
  const id = '00000000-0000-4000-8000-000000000002'
  const poll = { ...draft, id, content: '', kind: 'poll', poll: { options: [' A ', ' B '], duration: 24 } }
  assert.equal((await send({ ...poll, poll: { options: ['only one'], duration: 24 } })).status, 400)
  assert.equal((await send({ ...poll, poll: { options: ['A', 'B'], duration: 500 } })).status, 400)
  assert.equal((await send(poll)).status, 201)
  assert.deepEqual((state.rows.get(id)?.poll_data as {options: unknown}).options, [
    { text: 'A', votes: 0 }, { text: 'B', votes: 0 },
  ])
  assert.equal((await send(poll)).status, 200)
  assert.equal(state.mentions, 2)
})
