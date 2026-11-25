import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const member = '044cb383-5807-4e31-9167-8b0d7c44735c'
const owner = '67d72cb7-f6e1-4552-8d31-7e82a62ade95'
const thread = '5ffb8269-6a5b-4762-bbfe-f76de342cf6c'
const replyID = '0665ae57-6dcf-44b6-8c3b-8c0d38ccb3d7'
const stubs: Record<string, string> = {
  '@/lib/supabase/nativeAccount': `export async function requireNativeAccount(request) {
    return request.headers.get('authorization') === 'Bearer member'
      ? { userId: '${member}', supabase: globalThis.forumFixture.client }
      : { error: Response.json({}, { status: 401 }) }
  }`,
  '@/lib/supabase/adminDecisionActor': `export async function adminDecisionActor(request) {
    return request.headers.get('authorization') === 'Bearer admin'
      ? { user: { id: '${owner}' }, admin: globalThis.forumFixture.client }
      : { error: Response.json({}, { status: 403 }) }
  }`,
  '@/lib/supabase/admin': 'export const createAdminClient = () => globalThis.forumFixture.service',
  '@/lib/featureFlags.server': 'export async function isFeatureEnabledServer() { return globalThis.forumFixture.enabled }',
  '@/lib/requireTier': `export async function requireVerifiedUserTier(userId, tier) {
    if (tier !== 'basic' || userId !== '${member}') throw Error('Expected verified Basic access')
    return globalThis.forumFixture.free ? {error: Response.json({}, {status: 403})} : {userId}
  }`,
  '@/lib/mentions': `export const extractMentionedUsernames = text => [...text.matchAll(/@([a-zA-Z0-9_.]{1,30})/g)].map(match => match[1].toLowerCase());
    export async function notifyMentions(...params) { globalThis.forumFixture.mentions.push(params.slice(1)) }`,
  '@/lib/notify': 'export async function notify(_, target) { globalThis.forumFixture.notifications.push(target) }',
}
const bundle = await build({
  stdin: { contents: `export { GET, POST } from './src/app/api/mobile/forum/route';
    export { PATCH } from './src/app/api/mobile/admin/forum/route';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'cjs', tsconfig: 'tsconfig.json', write: false, external: ['next/server'],
  plugins: [{ name: 'forum-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'js' }))
  } }],
})
const fixture = { exports: {} as typeof import('../src/app/api/mobile/forum/route') & Pick<typeof import('../src/app/api/mobile/admin/forum/route'), 'PATCH'> }
new Function('require', 'exports', 'module', bundle.outputFiles[0].text)(createRequire(import.meta.url), fixture.exports, fixture)
const { GET, POST, PATCH } = fixture.exports
const path = 'https://slipsurge.invalid/api/mobile/forum'
const request = (suffix: string, auth?: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') => new Request(path + suffix, {
  method, headers: auth ? { authorization: auth } : {}, body: body === undefined ? undefined : JSON.stringify(body),
})

test('discussion availability and mutations preserve rollout, account and Basic gates', async () => {
  const state = { enabled: false, free: false, client: { from() { throw Error('Unexpected read') } },
    service: { rpc() { throw Error('Unexpected write') } } }
  Object.assign(globalThis, { forumFixture: state })
  const access = () => GET(request('?view=access', 'Bearer member'))
  const detail = () => GET(request('?view=detail&id=' + thread, 'Bearer member'))
  const create = () => POST(request('', 'Bearer member', { kind: 'reply', id: replyID, thread, content: 'Fixture' }))
  assert.equal((await detail()).status, 403)
  assert.equal((await create()).status, 403)
  state.enabled = true
  state.free = true
  assert.deepEqual(await (await access()).json(), { enabled: false })
  assert.equal((await detail()).status, 403)
  assert.equal((await create()).status, 403)
  assert.equal((await GET(request('?view=categories'))).status, 401)
  assert.equal((await GET(request('?view=access', 'Bearer expired'))).status, 401)
  state.free = false
  assert.deepEqual(await (await access()).json(), { enabled: true })
})

test('a reply uses the verified actor, confirms the exact row and only sends notifications once', async () => {
  const notifications: object[] = []
  const mentions: unknown[] = []
  let count = 0
  const row = { id: replyID, author_id: member, content: '@someone Good breakdown', is_deleted: false }
  Object.assign(globalThis, { forumFixture: { enabled: true, notifications, mentions, service: {
    async rpc(name: string, args: object) {
      assert.equal(name, 'create_native_forum_reply')
      assert.deepEqual(args, { p_actor: member, p_thread: thread, p_id: replyID, p_parent: null, p_content: row.content })
      return { data: { status: count++ === 0 ? 'created' : 'replay', recipient: owner } }
    },
  }, client: { from(table: string) {
    assert.equal(table, 'forum_replies')
    const filters: Record<string, string> = {}
    return { select() { return this }, eq(key: string, value: string) { filters[key] = value; return this }, async maybeSingle() {
      assert.deepEqual(filters, { id: replyID, thread_id: thread })
      return { data: row }
    } }
  } } } })
  const input = { kind: 'reply', id: replyID, thread, content: row.content, user_id: owner }
  const first = await POST(request('', 'Bearer member', input))
  assert.equal(first.status, 201)
  assert.deepEqual(await first.json(), { id: replyID, reply: row })
  assert.equal((await POST(request('', 'Bearer member', input))).status, 200)
  assert.equal(notifications.length, 1)
  assert.equal(mentions.length, 1)
})

test('discussion paging hides deleted content and returns aggregated reactions for the viewer', async () => {
  const timestamp = '2026-11-25T10:00:00+00:00'
  const rows = Array.from({ length: 51 }, (_, index) => ({
    id: `0665ae57-6dcf-44b6-8c3b-${String(index).padStart(12, '0')}`, created_at: timestamp,
    content: index === 0 ? '@deleted' : 'visible', is_deleted: index === 0,
  }))
  Object.assign(globalThis, { forumFixture: { enabled: true, client: { from(table: string) {
    const query = { select() { return this }, eq() { return this }, in() { return this }, order() { return this },
      async maybeSingle() { assert.equal(table, 'forum_threads'); return { data: { id: thread, content: '@actual @blocked' } } },
      or(value: string) {
        if (table === 'users') assert.equal(value, 'username.ilike."actual",username.ilike."blocked"')
        return this
      },
      async limit(value: number) {
        if (table === 'users') {
          assert.equal(value, 4)
          return { data: [{ id: owner, username: 'Actual' }, { id: thread, username: 'blocked' }] }
        }
        assert.equal(value, 51)
        return {data: rows}
      },
      async range() {
        if (table === 'blocks') return { data: [{ blocker_id: member, blocked_id: thread }] }
        assert.equal(table, 'reactions'); return {data: [
        { target_id: thread, emoji: '🔥', user_id: member }, { target_id: thread, emoji: '🔥', user_id: owner },
        { target_id: thread, emoji: 'unrelated', user_id: owner },
      ]} },
    }
    return query
  } } } })
  const response = await GET(request('?view=detail&id=' + thread, 'Bearer member'))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.replies.length, 50)
  assert.equal(body.replies[0].content, null)
  assert.equal(body.next, `${timestamp}|${rows[49].id}`)
  assert.deepEqual(body.reactions[thread], [{ emoji: '🔥', count: 2, mine: true }])
  assert.deepEqual(body.mentions, ['actual'])
  assert.equal((await GET(request('?view=detail&id=' + thread + '&after=invalid', 'Bearer member'))).status, 400)
})

test('moderation pins a thread only for verified admins using the last visible value', async () => {
  let condition: unknown
  Object.assign(globalThis, { forumFixture: { client: { from(table: string) {
    assert.equal(table, 'forum_threads')
    return { update(values: object) { assert.deepEqual(values, { is_pinned: true }); return this },
      eq(key: string, value: unknown) { if (key === 'is_pinned') condition = value; return this }, select() { return this },
      async maybeSingle() { return { data: condition === false ? { id: thread } : null } },
    }
  } } } })
  const input = { action: 'pin', enabled: true, expected: false, id: thread }
  assert.equal((await PATCH(request('', 'Bearer member', input, 'PATCH'))).status, 403)
  assert.equal((await PATCH(request('', 'Bearer admin', input, 'PATCH'))).status, 200)
  assert.equal((await PATCH(request('', 'Bearer admin', { ...input, expected: true }, 'PATCH'))).status, 409)
})
