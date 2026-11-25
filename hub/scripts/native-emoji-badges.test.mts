import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'
import { nativeChatReaction } from '../src/lib/nativeChatReaction'

const operator = '044cb383-5807-4e31-9167-8b0d7c44735c'
const person = '0665ae57-6dcf-44b6-8c3b-8c0d38ccb3d7'
const id = '5ffb8269-6a5b-4762-bbfe-f76de342cf6c'
const media = (kind: string, owner = operator) => `https://fixture.invalid/storage/v1/object/public/media/${kind}/${owner}/5ffb8269-6a5b-4762-bbfe-f76de342cf6c.png`
const mocks: Record<string, string> = {
  '@/lib/supabase/adminDecisionActor': `export async function adminDecisionActor(request) {
    return request.headers.get('authorization') === 'Bearer staff'
      ? {user: {id: '${operator}'}, admin: globalThis.emblemFixture.client}
      : {error: Response.json({}, {status: 403})}
  }`,
  '@/lib/supabase/nativeAccount': 'export async function requireNativeAccount() { return {error: Response.json({}, {status: 401})} }',
  '@/lib/nativeSocial': 'export function nativeAnonymousClient() { return globalThis.emblemFixture.client }',
  'server-only': '',
}
const bundle = await build({
  stdin: { contents: `export {GET as publicEmoji} from './src/app/api/mobile/emojis/route';
    export {POST as adminEmoji} from './src/app/api/mobile/admin/emojis/route';
    export {POST as adminBadge} from './src/app/api/mobile/admin/badges/route';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', write: false, format: 'cjs', tsconfig: 'tsconfig.json', external: ['next/server'],
  plugins: [{ name: 'native-emblem-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => args.path in mocks ? {path: args.path, namespace: 'fixture'} : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({contents: mocks[args.path], loader: 'js'}))
  } }],
})
const fixture = { exports: {} as {
  publicEmoji: typeof import('../src/app/api/mobile/emojis/route')['GET'];
  adminEmoji: typeof import('../src/app/api/mobile/admin/emojis/route')['POST'];
  adminBadge: typeof import('../src/app/api/mobile/admin/badges/route')['POST'];
} }
new Function('require', 'exports', 'module', bundle.outputFiles[0].text)(createRequire(import.meta.url), fixture.exports, fixture)
const { publicEmoji, adminEmoji, adminBadge } = fixture.exports
const request = (body?: unknown, token?: string) => new Request('https://fixture.invalid/api/mobile/emojis', {
  method: body === undefined ? 'GET' : 'POST', headers: token ? {authorization: `Bearer ${token}`} : {},
  body: body === undefined ? undefined : JSON.stringify(body),
})

test('the guest emoji directory projects only public art and the exact website standard vocabulary', async () => {
  const sample = {code: 'nba_clutch', image_url: media('emojis'), category: {name: 'NBA'}}
  Object.assign(globalThis, {emblemFixture: {client: {from(table: string) {
    assert.equal(table, 'custom_emojis')
    return {select(fields: string) { assert.equal(fields, 'code,image_url,category:custom_emoji_categories(name)'); return this },
      order() { return this }, async range() { return {data: [sample]} }}
  }}}})
  const response = await publicEmoji(request())
  const data = await response.json()
  assert.deepEqual(data.emojis, [sample])
  assert.ok(data.standard.some((group: {label: string}) => group.label === 'Sports'))
  assert.equal((await publicEmoji(request(undefined, 'expired'))).status, 401)
})

test('admin emoji writes verify owned uploads and reject ordinary members', async context => {
  const previous = process.env.NEXT_PUBLIC_SUPABASE_URL
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.invalid'
  context.after(() => { if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previous })
  let inserted = 0
  Object.assign(globalThis, {emblemFixture: {client: {from(table: string) {
    assert.equal(table, 'custom_emojis')
    return {insert(payload: object) {
      assert.deepEqual(payload, {id, code: 'nba_clutch', category_id: null, image_url: media('emojis'), uploaded_by: operator})
      inserted++
      return this
    }, select() { return this }, async single() { return {data: {id}} }}
  }}}})
  const valid = {id, action: 'createEmoji', code: 'NBA_CLUTCH', image: media('emojis')}
  assert.equal((await adminEmoji(request(valid, 'member'))).status, 403)
  assert.equal((await adminEmoji(request({...valid, image: media('posts')}, 'staff'))).status, 400)
  assert.equal((await adminEmoji(request({...valid, image: media('emojis', person)}, 'staff'))).status, 400)
  assert.equal((await adminEmoji(request(valid, 'staff'))).status, 201)
  assert.equal(inserted, 1)
})

test('bulk badges are bounded, de-duplicate targets and retain the verified awarding admin', async () => {
  let writes = 0
  Object.assign(globalThis, {emblemFixture: {client: {from(table: string) {
    if (table === 'badges') return {select() { return this }, eq() { return this }, async maybeSingle() { return {data: {id}} }}
    assert.equal(table, 'user_badges')
    return {upsert(rows: unknown[], options: object) {
      assert.deepEqual(rows, [{user_id: person, badge_id: id, awarded_by: operator}])
      assert.deepEqual(options, {onConflict: 'user_id,badge_id', ignoreDuplicates: true})
      writes++
      return this
    }, async select() { return {data: [{id}]}} }
  }}}})
  assert.equal((await adminBadge(request({id, action: 'awardBulk', members: [person]}, 'member'))).status, 403)
  assert.equal((await adminBadge(request({id, action: 'awardBulk', members: Array(1001).fill(person)}, 'staff'))).status, 400)
  assert.deepEqual(await (await adminBadge(request({id, action: 'awardBulk', members: [person, person]}, 'staff'))).json(), {id, awarded: 1})
  assert.equal(writes, 1)
})

test('chat accepts a registered long shortcode and allows cleanup after catalog removal', async () => {
  let exists = true
  const code = 'long_slipsurge_custom_reaction'
  let lookup = 0
  const client = {from(table: string) {
    assert.equal(table, 'custom_emojis')
    return {select() { return this }, eq(_key: string, value: string) { assert.equal(value, code); return this },
      async maybeSingle() { lookup++; return {data: exists ? {code} : null} }}
  }} as unknown as Parameters<typeof nativeChatReaction>[0]
  assert.deepEqual(await nativeChatReaction(client, '🔥', true), {emoji: '🔥'})
  assert.deepEqual(await nativeChatReaction(client, `:${code}:`, true), {emoji: `:${code}:`})
  exists = false
  assert.deepEqual(await nativeChatReaction(client, `:${code}:`, true), {status: 400})
  assert.deepEqual(await nativeChatReaction(client, `:${code}:`, false), {emoji: `:${code}:`})
  assert.equal(lookup, 2)
})
