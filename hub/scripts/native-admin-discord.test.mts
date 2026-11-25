import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const server = '100200300400500600'
const channel = '617161716171617161'
const version = '2026-11-25T15:00:00.000Z'
const calls: { target: string; value: unknown }[] = []
const fixture = {
  current: version,
  existing: true,
  database: {
    from() { return this },
    update(value: object) { calls.push({ target: 'update', value }); return this },
    eq(field: string, value: string) { if (field === 'updated_at') fixture.existing = value === fixture.current; return this },
    select() { return this },
    async maybeSingle() { return { data: fixture.existing ? { enabled: true, updated_at: fixture.current } : null } },
    async single() { return { data: { enabled: true, updated_at: fixture.current } } },
  },
}
Object.assign(globalThis, { nativeAdminDiscordFixture: fixture, nativeAdminDiscordCalls: calls })
const stubs: Record<string, string> = {
  'next/server': 'export const NextResponse = Response;',
  '@/lib/discordAdminActor': `export const discordAdminActor = async req => req.headers.get('authorization') === 'Bearer admin'
    ? {id:'fixture', native:true} : {error:Response.json({error:'Forbidden'}, {status:403})};`,
  '@/lib/supabase/admin': 'export const createAdminClient = () => globalThis.nativeAdminDiscordFixture.database;',
  '@/lib/safeApiError': 'export const safeApiError = () => Response.json({}, {status:503});',
  '@/lib/adminAudit': 'export const writeAdminAudit = async (_, value) => globalThis.nativeAdminDiscordCalls.push({target:"audit", value});',
  '@/lib/serverRateLimit': 'export const consumeServerRateLimit = async () => ({available:true, allowed:true});',
  '@/lib/discord': `export const getDiscordConfig = async () => ({enabled:true,guild_id:'${server}'});
    export const getGuildChannels = async () => [{id:'${channel}',name:'test-qa'}];
    export const postToChannelChecked = async (id, payload) => { globalThis.nativeAdminDiscordCalls.push({target:id,value:payload}); return {ok:true}; };`,
}
const bundled = await build({
  entryPoints: ['src/app/api/admin/discord/config/route.ts', 'src/app/api/admin/discord/compose/route.ts'],
  outbase: 'src/app/api/admin/discord', outdir: 'fixture', bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'discord-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, arg => Object.hasOwn(stubs, arg.path) ? { path: arg.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, arg => ({ contents: stubs[arg.path] }))
  } }],
})
function route<T>(name: string): T {
  const file = bundled.outputFiles.find(item => item.path.endsWith(`/${name}/route.js`))!
  const module = { exports: {} }
  new Function('require', 'module', 'exports', file.text)(createRequire(import.meta.url), module, module.exports)
  return module.exports as T
}
const config = route<typeof import('../src/app/api/admin/discord/config/route')>('config')
const compose = route<typeof import('../src/app/api/admin/discord/compose/route')>('compose')
const request = (method: string, body: object, member = true) => new Request('https://fixture.invalid/api/admin/discord/', {
  method, headers: member ? { authorization: 'Bearer admin' } : {}, body: JSON.stringify(body),
})

test('native Discord configuration requires MFA admin actor, current version and valid IDs', async () => {
  assert.equal((await config.PATCH(request('PATCH', { enabled: true }, false))).status, 403)
  assert.equal((await config.PATCH(request('PATCH', { enabled: true }))).status, 409)
  assert.equal((await config.PATCH(request('PATCH', { guild_id: 'bad', expectedUpdatedAt: version }))).status, 400)
  assert.equal((await config.PATCH(request('PATCH', { enabled: true, expectedUpdatedAt: '2026-11-25T14:59:59.999Z' }))).status, 409)
  assert.equal((await config.PATCH(request('PATCH', { guild_id: server, enabled: true, expectedUpdatedAt: version }))).status, 200)
  const audits = calls.filter(call => call.target === 'audit')
  assert.equal(audits.length, 1)
  assert.deepEqual((audits[0].value as { details: object }).details, { fields: ['guild_id', 'enabled'] })
})

test('native Discord composer verifies the configured channel and audits only the operation', async () => {
  calls.length = 0
  assert.equal((await compose.POST(request('POST', { channelId: channel, title: 'Fixture' }, false))).status, 403)
  assert.equal((await compose.POST(request('POST', { channelId: server, title: 'Fixture' }))).status, 400)
  assert.equal((await compose.POST(request('POST', { channelId: channel, title: 'Fixture', imageUrl: 'http://fixture.invalid/test.png' }))).status, 400)
  assert.equal(calls.length, 0)
  assert.equal((await compose.POST(request('POST', { channelId: channel, title: 'Fixture', description: 'Test fixture', color: 0xB4FF4D }))).status, 200)
  assert.deepEqual(calls[0], { target: channel, value: { embeds: [{ title: 'Fixture', description: 'Test fixture', color: 0xB4FF4D }] } })
  assert.equal((calls[1].value as { action: string }).action, 'discord_embed_sent')
  assert.deepEqual((calls[1].value as { details: object }).details, { hasEmbed: true })
})
