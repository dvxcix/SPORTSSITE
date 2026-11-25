import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const member = '044cb383-5807-4e31-9167-8b0d7c44735c'
const event = '5ffb8269-6a5b-4762-bbfe-f76de342cf6c'
const stubs: Record<string, string> = {
  '@/lib/supabase/nativeAccount': `export async function requireNativeAccount(request) {
    return request.headers.get('authorization') === 'Bearer member'
      ? { userId: '${member}', supabase: globalThis.eventsFixture.client }
      : { error: Response.json({}, { status: 401 }) }
  }`,
  '@/lib/nativeSocial': 'export const nativeAnonymousClient = () => globalThis.eventsFixture.client',
  '@/lib/featureFlags.server': 'export async function isFeatureEnabledServer() { return globalThis.eventsFixture.enabled }',
  '@/lib/blocks': 'export const isAccountId = input => /^[0-9a-f-]{36}$/i.test(input)',
  '@/lib/supabase/adminDecisionActor': `export async function adminDecisionActor(request) {
    return request.headers.get('authorization') === 'Bearer admin'
      ? { user: { id: '${member}' }, admin: globalThis.eventsFixture.client }
      : { error: Response.json({}, { status: 403 }) }
  }`,
}
const bundle = await build({
  stdin: { contents: "export {GET,POST} from './src/app/api/mobile/events/route'; export {DELETE} from './src/app/api/mobile/admin/events/route';",
    resolveDir: process.cwd(), loader: 'ts' }, platform: 'node', format: 'cjs', bundle: true, write: false,
  tsconfig: 'tsconfig.json', external: ['next/server'],
  plugins: [{name: 'events-fixture', setup(plugin) {
    plugin.onResolve({filter: /.*/}, args => args.path in stubs ? {path: args.path, namespace: 'fixture'} : undefined)
    plugin.onLoad({filter: /.*/, namespace: 'fixture'}, args => ({contents: stubs[args.path], loader: 'js'}))
  }}],
})
const fixture = { exports: {} as typeof import('../src/app/api/mobile/events/route') & Pick<typeof import('../src/app/api/mobile/admin/events/route'), 'DELETE'> }
new Function('require', 'exports', 'module', bundle.outputFiles[0].text)(require, fixture.exports, fixture)
const { GET, POST, DELETE } = fixture.exports
const eventPath = 'https://slipsurge.invalid/api/mobile/events'
const request = (suffix = '', payload?: unknown, auth?: string) => new Request(eventPath + suffix, {
  method: payload === undefined ? 'GET' : 'POST', headers: auth ? {authorization: auth} : {},
  body: payload === undefined ? undefined : JSON.stringify(payload),
})

test('an off rollout hides events and rejects RSVP without contacting event data', async () => {
  Object.assign(globalThis, {eventsFixture: {enabled: false, client: {from() { throw new Error('Unexpected event read') }}}})
  assert.deepEqual(await (await GET(request('?view=access'))).json(), {enabled: false})
  assert.equal((await GET(request('?view=detail&id=' + event))).status, 403)
  assert.equal((await POST(request('', {kind: 'attendance', id: event, status: 'going'}, 'Bearer member'))).status, 403)
})

test('RSVP reads a visible event and writes only the authenticated member’s row', async () => {
  let visible = false
  let requested = 0
  Object.assign(globalThis, {eventsFixture: {enabled: true, client: {from(table: string) {
    if (table === 'events') return {select() { return this }, eq() { return this }, async maybeSingle() { return {data: visible ? {id: event} : null} }}
    assert.equal(table, 'event_rsvps')
    return {async upsert(values: object) {
      assert.deepEqual(values, {event_id: event, user_id: member, status: 'going'})
      requested++
      return {}
    }}
  }}}})
  const input = {kind: 'attendance', id: event, status: 'going', user_id: 'unrelated'}
  assert.equal((await POST(request('', input))).status, 401)
  assert.equal((await POST(request('', input, 'Bearer member'))).status, 404)
  assert.equal(requested, 0)
  visible = true
  const response = await POST(request('', input, 'Bearer member'))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).rsvp, 'going')
  assert.equal(requested, 1)
})

test('event creation keeps the same draft identifier and rejects conflicting data on replay', async () => {
  let existing: Record<string, unknown> | null = null
  Object.assign(globalThis, {eventsFixture: {enabled: true, client: {from(table: string) {
    assert.equal(table, 'events')
    let inserted: Record<string, unknown>
    return {
      insert(values: Record<string, unknown>) { inserted = values; return this },
      select() { return this }, eq() { return this },
      async single() {
        if (existing) return {error: {code: '23505'}}
        existing = inserted
        return {data: {id: event}}
      },
      async maybeSingle() { return {data: existing} },
    }
  }}}})
  const input = {kind: 'create', id: event, title: 'Watch Party', description: '', location: '', sport: 'NBA',
    start: '2026-11-25T15:05:00Z', end: '2026-11-25T16:05:00Z', online: true, link: 'https://example.com/room'}
  assert.equal((await POST(request('', {...input, link: 'javascript:confirm(1)'}, 'Bearer member'))).status, 400)
  assert.equal((await POST(request('', input, 'Bearer member'))).status, 201)
  assert.equal((await POST(request('', input, 'Bearer member'))).status, 200)
  assert.equal((await POST(request('', {...input, title: 'Another event'}, 'Bearer member'))).status, 409)
  const removal = new Request(eventPath + '?id=' + event, {method: 'DELETE', headers: {authorization: 'Bearer member'}})
  assert.equal((await DELETE(removal)).status, 403)
})
