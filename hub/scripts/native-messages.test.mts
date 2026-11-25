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
const fixture = { blocked: false, allow: true, rows: new Map<string, { id: string; sender_id: string }>(), scopes: [] as string[], inserts: 0, notifications: 0 }
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
  const chain = {
    select: () => chain,
    eq: (column: string, value: string) => { if (column === 'id') id = value; return chain },
    or: (scope: string) => { fixture.scopes.push(scope); return chain },
    order: async () => ({ data: [], error: null }),
    async maybeSingle() {
      switch (table) {
        case 'users': return { data: { id, username: 'fixture', allow_dms: fixture.allow }, error: null }
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
Object.assign(globalThis, { messageFixture: fixture, messageClient: { from: query } })

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
