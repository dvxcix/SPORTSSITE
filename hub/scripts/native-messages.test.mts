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
const forwarded = 'aaaaaaaa-0000-4000-a000-000000000007'
const instant = '2026-11-25T03:14:15.123456+00:00'
type SavedMessage = { id: string; sender_id: string; content?: string; media_urls?: string[]; message_type?: string;
  dm_recipient_id?: string; forwarded_from_id?: string; is_deleted?: boolean }
const fixture = { blocked: false, allow: true, channelAllowed: true, rows: new Map<string, SavedMessage>(),
  scopes: [] as string[], inserts: 0, notifications: 0, channelReads: 0, conversationReads: 0, groupAllowed: false }
const channelMessages = Array.from({ length: 85 }, (_, index) => ({
  id: `bbbbbbbb-0000-4000-b000-${String(index + 1).padStart(12, '0')}`, created_at: instant, sender_id: user, content: 'History fixture',
})).reverse()
const directMessages = Array.from({ length: 105 }, (_, index) => ({
  id: `cccccccc-0000-4000-a000-${String(index + 1).padStart(12, '0')}`, created_at: instant, sender_id: user, content: 'Conversation fixture',
})).reverse()
const groupMessages = Array.from({ length: 205 }, (_, index) => ({
  id: `dddddddd-0000-4000-a000-${String(index + 1).padStart(12, '0')}`, created_at: instant, sender_id: user, content: 'Group fixture',
})).reverse()
const stubs: Record<string, string> = {
  'server-only': '',
  'next/server': 'export const NextResponse = Response',
  '@/lib/supabase/nativeAccount': `export const requireNativeAccount = async req => req.headers.get('authorization') === 'Bearer fixture' ?
    {supabase: globalThis.messageClient, userId: '${user}'} : {error: Response.json({}, {status: 401})}`,
  '@/lib/blocks': 'export const isAccountId = value => /^[a-f0-9-]{36}$/.test(value); export const isBlockedEitherWay = async () => globalThis.messageFixture.blocked',
  '@/lib/messageInboxServer': 'export const loadMessageInbox = async () => ({conversations: [], groupConversations: []})',
  '@/lib/messageRecipients': 'export const searchMessageRecipients = async () => []',
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
  let groupId: string | undefined
  let slug: string | undefined
  let globalOnly = false
  let pair: string | undefined
  let scope: string | undefined
  let limit = 0
  const chain = {
    select: () => chain,
    eq: (column: string, value: string) => {
      if (column === 'id') id = value
      if (column === 'channel_id') channelId = value
      if (column === 'conversation_id') groupId = value
      if (column === 'group_id') groupId = value
      if (column === 'slug') slug = value
      return chain
    },
    is: (column: string, value: unknown) => {
      if (column === 'group_id' && value === null) globalOnly = true
      return chain
    },
    or: (value: string) => {
      if (value.includes('dm_recipient_id')) pair = value
      scope = value
      fixture.scopes.push(value)
      return chain
    },
    not: () => chain,
    order: () => chain,
    limit: (value: number) => { limit = value; return chain },
    in: () => chain,
    abortSignal: () => chain,
    then<T>(resolve: (value: { data: unknown[]; error: null }) => T) {
      if (table === 'group_conversation_members' && groupId === group && fixture.groupAllowed) {
        return Promise.resolve(resolve({ data: [{ user_id: user, role: 'member', muted: false }], error: null }))
      }
      let rows: typeof channelMessages = []
      if (table === 'messages' && channelId === channel) { fixture.channelReads++; rows = channelMessages }
      if (table === 'messages' && pair?.includes(user) && pair.includes(partner) && limit > 0) { fixture.conversationReads++; rows = directMessages }
      if (table === 'group_messages' && groupId === group && limit > 0) { fixture.conversationReads++; rows = groupMessages }
      const edge = scope?.match(/id\.lt\.([a-f0-9-]+)\)$/)?.[1]
      return Promise.resolve(resolve({ data: rows.filter(row => !edge || row.id < edge).slice(0, limit), error: null }))
    },
    async maybeSingle() {
      switch (table) {
        case 'users': return { data: { id, username: 'fixture', allow_dms: fixture.allow }, error: null }
        case 'channels': {
          const matchesSlug = slug === 'private-history' && groupId === group && !globalOnly
          return { data: id === channel || matchesSlug ? { id: channel, name: 'Private history', group_id: group, channel_type: 'private' } : null, error: null }
        }
        case 'groups': return { data: id === group ? { sport: 'NBA' } : null, error: null }
        case 'group_conversations': return { data: { name: 'Private' }, error: null }
        case 'message_read_positions': return { data: { last_read_at: instant }, error: null }
        default: {
          const row = id ? fixture.rows.get(id) : null
          const paired = !pair || row?.sender_id === user && row.dm_recipient_id === partner || row?.sender_id === partner && row.dm_recipient_id === user
          return { data: row && paired ? row : null, error: null }
        }
      }
    },
    async insert(row: SavedMessage) {
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

test('linked room selection keeps the requested group, tier and permission boundaries', async () => {
  const route = 'view=channel-link&slug=private-history'
  assert.equal((await request(`${route}&group=${group}`, undefined, false)).status, 401)
  assert.equal((await request(route)).status, 404)
  assert.equal((await request(`${route}&group=${partner}`)).status, 404)
  assert.equal((await request(`${route}&group=${group}&slug=other`)).status, 400)
  fixture.channelAllowed = false
  assert.equal((await request(`${route}&group=${group}`)).status, 404)
  fixture.channelAllowed = true
  assert.deepEqual(await (await request(`${route}&group=${group}`)).json(), { id: channel })
})

test('private inbox and room actions require a member and group membership', async () => {
  assert.equal((await request('', undefined, false)).status, 401)
  assert.equal((await request(`view=thread&kind=group&id=${group}`)).status, 404)
  fixture.blocked = true
  assert.equal((await request(`view=thread&kind=direct&id=${partner}`)).status, 404)
  fixture.blocked = false
})

test('direct and group pages preserve same-timestamp boundaries and revoke access on an older page', async () => {
  fixture.groupAllowed = true
  for (const [kind, identifier, count] of [['direct', partner, 100], ['group', group, 200]] as const) {
    const room = `view=thread&kind=${kind}&id=${identifier}`
    const latest = await request(room)
    assert.equal(latest.status, 200)
    const page = await latest.json()
    assert.equal(page.messages.length, count)
    assert.equal(page.partnerLastReadAt, kind === 'direct' ? instant : null)
    assert.equal(page.nextCursor, `${instant}|${page.messages[0].id}`)
    const older = `${room}&before=${encodeURIComponent(page.nextCursor)}`
    const history = await (await request(older)).json()
    assert.equal(history.messages.length, 5)
    assert.equal(history.nextCursor, null)
    assert.equal(history.partnerLastReadAt, null)
    assert.equal(new Set([...history.messages, ...page.messages].map(row => row.id)).size, count + 5)
    assert.ok(fixture.scopes.at(-1)?.includes(`created_at.eq.${instant}`))
    const beforeReads = fixture.conversationReads
    if (kind === 'direct') fixture.blocked = true
    else fixture.groupAllowed = false
    assert.equal((await request(older)).status, 404)
    assert.equal(fixture.conversationReads, beforeReads)
    fixture.blocked = false
  }
})

test('a reply stays in its own direct conversation and a retried send does not duplicate it', async () => {
  const room = `kind=direct&id=${partner}`
  const send = { action: 'send', message, text: 'A fixture message' }
  fixture.rows.clear()
  fixture.scopes.length = 0
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

test('forwarding copies only stored direct-message content and retries the same recipient once', async () => {
  const room = `kind=direct&id=${partner}`
  const action = { action: 'forward', message, user: partner, forwardId: forwarded, text: 'Ignored client copy' }
  fixture.rows.clear()
  fixture.inserts = 0
  const payload = { id: message, sender_id: partner, dm_recipient_id: user, content: 'Database copy',
    media_urls: ['https://example.com/photo.png'], message_type: 'media' }
  fixture.rows.set(message, { ...payload, is_deleted: true })
  assert.equal((await request(room, action)).status, 404)
  fixture.rows.set(message, { ...payload, dm_recipient_id: group })
  assert.equal((await request(room, action)).status, 404)
  fixture.rows.set(message, payload)
  fixture.allow = false
  assert.equal((await request(room, action)).status, 403)
  fixture.allow = true
  assert.equal((await request(room, action)).status, 200)
  assert.equal((await request(room, action)).status, 200)
  assert.equal(fixture.inserts, 1)
  const copy = fixture.rows.get(forwarded)
  assert.equal(copy?.content, 'Database copy')
  assert.equal(copy?.sender_id, user)
  assert.equal(copy?.forwarded_from_id, message)
  assert.deepEqual(copy?.media_urls, payload.media_urls)
})
