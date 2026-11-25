import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const story = '941eeaad-871e-416c-93ab-d9245f1cfea2'
const media = 'https://media0.giphy.com/media/fixture/giphy.gif'
const saved: Record<string, unknown>[] = []
const fixture = {
  enabled: true, plan: true, baseball: false,
  client: {
    from() { return this }, select() { return this }, eq() { return this },
    async maybeSingle() { return { data: null } },
    async insert(row: Record<string, unknown>) { saved.push(row); return { error: null } },
  },
}
Object.assign(globalThis, { nativeStoryMediaFixture: fixture })
const stubs: Record<string, string> = {
  'server-only': '', 'next/server': 'export const NextResponse = Response;',
  '@/lib/blocks': 'export const isAccountId = value => typeof value === "string" && /^[a-f0-9-]{36}$/.test(value); export const getBlockedEitherWayIds = async () => [];',
  '@/lib/featureFlags': 'export const FEATURE_FLAGS = {stories:"stories"};',
  '@/lib/featureFlags.server': 'export const isFeatureEnabledServer = async () => globalThis.nativeStoryMediaFixture.enabled;',
  '@/lib/mlbViewerAccess': 'export const canViewMlb = async () => globalThis.nativeStoryMediaFixture.baseball;',
  '@/lib/nativeSocial': 'export const nativeAnonymousClient = () => globalThis.nativeStoryMediaFixture.client;',
  '@/lib/requireTier': `export const requireTier = async () => globalThis.nativeStoryMediaFixture.plan ? {userId:'fixture'} : {error:Response.json({}, {status:403})};`,
  '@/lib/serverRateLimit': 'export const consumeServerRateLimit = async () => ({available:true,allowed:true});',
  '@/lib/supabase/nativeAccount': `export const requireNativeAccount = async req => req.headers.has('authorization')
    ? {supabase:globalThis.nativeStoryMediaFixture.client,userId:'fixture'} : {error:Response.json({}, {status:401})};`,
}
const bundle = await build({
  entryPoints: ['src/app/api/mobile/stories/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'native-story-media-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, arg => Object.hasOwn(stubs, arg.path) ? { path: arg.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, arg => ({ contents: stubs[arg.path] }))
  } }],
})
const module = { exports: {} as typeof import('../src/app/api/mobile/stories/route') }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const submit = (photo: string, authorized = true, sport = 'NBA') => module.exports.POST(new Request('https://fixture.invalid/api/mobile/stories', {
  method: 'POST', body: JSON.stringify({ id: story, photo, content: '', sport }), headers: authorized ? { authorization: 'Bearer fixture' } : {},
}))

test('story GIF sharing accepts trusted provider artwork and preserves tier and league gates', async () => {
  assert.equal((await submit(media, false)).status, 401)
  fixture.plan = false
  assert.equal((await submit(media)).status, 403)
  fixture.plan = true
  assert.equal((await submit(media, true, 'MLB')).status, 403)
  assert.equal((await submit('https://other.invalid/image.gif')).status, 400)
  assert.equal(saved.length, 0)
  assert.equal((await submit(media)).status, 201)
  assert.equal(saved[0].media_url, media)
  assert.equal(saved[0].story_type, 'image')
  assert.equal(saved[0].sport, 'NBA')
})
