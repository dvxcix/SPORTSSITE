import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const user = 'aaaaaaaa-0000-4000-a000-000000000001'
const partner = 'aaaaaaaa-0000-4000-a000-000000000002'
const message = 'aaaaaaaa-0000-4000-a000-000000000003'
const reply = 'aaaaaaaa-0000-4000-a000-000000000004'
const group = 'aaaaaaaa-0000-4000-a000-000000000005'
const channel = 'aaaaaaaa-0000-4000-a000-000000000006'
const instant = '2026-11-25T03:14:15.123456+00:00'
const fixture = { blocked: false, allow: true, channelAllowed: true, rows: new Map<string, { id: string; sender_id: string }>(),
  scopes: [] as string[], inserts: 0, notifications: 0, channelReads: 0 }
const channelMessages = Array.from({ length: 85 }, (_, index) => ({
  id: `bbbbbbbb-0000-4000-b000-${String(index + 1).padStart(12, '0')}`, created_at: instant, sender_id: user, content: 'History fixture',
})).reverse()
const stubs: Record<string, string> = {
  'server-only': '',
  'next/server': 'export const NextResponse = Response',
  '@/lib/supabase/nativeAccount': `export const requireNativeAccount = async req => req.headers.get('authorization') === 'Bearer fixture' ?
    {supabase: globalThis.messageClient, userId: '${user}'} : {error: Response.json({}, {status: 401})}`,
  '@/lib/blocks': 'export const isAccountId = value => /^[a-f0-9-]{36}$/.test(value); export const isBlockedEitherWay = async () => globalThis.messageFixture.blocked',
  '@/lib/messageInboxServer': 'export const loadMessageInbox = async () => ({conversations: [], groupConversations: []})',
  '@/lib/messageRecipients': 'export const searchMessageRecipients = async () => []',
  '@/lib/conversationHistory': 'export const loadDmHistory = async () => []; export const loadGroupHistory = async () => []',
  '@/lib/notify': 'export async function notify() { globalThis.messageFixture.notifications += 1 }',
}
const source = await build({
  entryPoints: ['src/app/api/mobile/messages/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'message-fixture', setup(plugin) {
    plugin.onResolve({ filter: /^(@\/lib\/|server-only|next\/server)/ }, args => Object.hasOwn(stubs, args.path) ? { path: args.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path] }))
  } }],
})
const loaded = { exports: {} as Record<'GET' | 'POST', (request: Request) => Promise<Response>> }
new Function('require', 'module', 'exports', source.outputFiles[0].text)(require, loaded, loaded.exports)

function query(table: string) {
  let id: string | undefined
  let channelId: string | undefined
  let scope: string | undefined
  let limit = 0
  const chain = {
    select: () => chain,
    eq: (column: string, value: string) => {
      if (column === 'id') id = value
      if (column === 'channel_id') channelId = value
      return chain
    },
    or: (value: string) => { scope = value; fixture.scopes.push(value); return chain },
    order: () => chain,
    limit: (value: number) => { limit = value; return chain },
    in: () => chain,
    abortSignal: () => chain,
    then<T>(resolve: (value: { data: unknown[]; error: null }) => T) {
      if (table !== 'messages' || channelId !== channel) return Promise.resolve(resolve({ data: [], error: null }))
      fixture.channelReads++
      const edge = scope?.match(/id\.lt\.([a-f0-9-]+)\)$/)?.[1]
      return Promise.resolve(resolve({ data: channelMessages.filter(row => !edge || row.id < edge).slice(0, limit), error: null }))
    },
    async maybeSingle() {
      switch (table) {
        case 'users': return { data: { id, username: 'fixture', allow_dms: fixture.allow }, error: null }
        case 'channels': return { data: id === channel ? { id, name: 'Private history', group_id: group, channel_type: 'private' } : null, error: null }
        case 'groups': return { data: id === group ? { sport: 'NBA' } : null, error: null }
        case 'group_conversations': return { data: { name: 'Private' }, error: null }
        default: return { data: id ? fixture.rows.get(id) ?? null : null, error: null }
      }
    },
    async insert(row: { id: string; sender_id: string }) {
      fixture.rows.set(row.id, row)
      fixture.inserts += 1
      return { error: null }
    },
    async upsert() { return { error: null } },
  }
  return chain
}
Object.assign(globalThis, { messageFixture: fixture, messageClient: { from: query,
  rpc: async (name: string) => ({ data: name === 'get_my_channel_permissions' ? { view: fixture.channelAllowed, send: true } : null, error: null }),
} })

async function request(search: string, action?: unknown, signedIn = true) {
  const method = action ? 'POST' : 'GET'
  return loaded.exports[method](new Request(`https://example.com/api/mobile/messages?${search}`, {
    method, body: action ? JSON.stringify(action) : undefined, headers: signedIn ? { authorization: 'Bearer fixture' } : {},
  }))
}

test('private inbox and room actions require a member and group membership', async () => {
  assert.equal((await request('', undefined, false)).status, 401)
  assert.equal((await request(`view=thread&kind=group&id=${group}`)).status, 404)
  fixture.blocked = true
  assert.equal((await request(`view=thread&kind=direct&id=${partner}`)).status, 404)
  fixture.blocked = false
})

test('a reply stays in its own direct conversation and a retried send does not duplicate it', async () => {
  const room = `kind=direct&id=${partner}`
  const send = { action: 'send', message, text: 'A fixture message' }
  fixture.rows.clear()
  fixture.notifications = fixture.inserts = 0
  assert.equal((await request(room, { ...send, reply })).status, 404)
  assert.equal(fixture.inserts, 0)
  assert.ok(fixture.scopes.every(scope => scope.includes(user) && scope.includes(partner)))
  fixture.allow = false
  assert.equal((await request(room, send)).status, 403)
  fixture.allow = true
  assert.equal((await request(room, send)).status, 200)
  assert.equal((await request(room, send)).status, 200)
  assert.equal(fixture.inserts, 1)
  assert.equal(fixture.notifications, 1)
  assert.equal(fixture.rows.get(message)?.sender_id, user)
})

test('channel history uses a same-timestamp message cursor and checks room permission on every page', async () => {
  const room = `view=thread&kind=channel&id=${channel}`
  const latest = await request(room)
  assert.equal(latest.status, 200)
  const page = await latest.json()
  assert.equal(page.messages.length, 80)
  assert.equal(page.nextCursor, `${instant}|${page.messages[0].id}`)
  const olderQuery = `${room}&before=${encodeURIComponent(page.nextCursor)}`
  const older = await request(olderQuery)
  assert.equal(older.status, 200)
  const history = await older.json()
  assert.equal(history.messages.length, 5)
  assert.equal(history.nextCursor, null)
  assert.equal(new Set([...history.messages, ...page.messages].map(row => row.id)).size, 85)
  assert.ok(fixture.scopes.at(-1)?.includes(`created_at.eq.${instant}`))
  const reads = fixture.channelReads
  assert.equal((await request(`${room}&before=${encodeURIComponent('any),or(select.*)')}`)).status, 400)
  fixture.channelAllowed = false
  assert.equal((await request(olderQuery)).status, 404)
  assert.equal(fixture.channelReads, reads)
  fixture.channelAllowed = true
})
