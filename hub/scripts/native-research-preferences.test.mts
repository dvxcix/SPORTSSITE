import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'
import type { ResearchPreferences } from '../src/lib/researchPreferences'

const owner = '7faffcca-294a-49dc-9c86-fc3f09eaba23'
const other = 'c2bd41c2-e513-4bdc-b572-3f5c7997b011'
const saved = { version: 1, launchPage: 'nba-odds-board', books: ['draftkings', 'caesars'], primaryBook: 'draftkings' }
const reads: unknown[] = []
const fixture = { nba: false, nflUser: '', available: true }
Object.assign(globalThis, { researchSettingsFixture: fixture, researchSettingsReads: reads, savedResearchSettings: saved })
const stubs: Record<string, string> = {
  'next/server': 'export const NextResponse = Response',
  '@/lib/nbaAccessPolicy': 'export const NBA_ACCESS_COLUMNS = "account_type,tier"; export const hasNbaAccess = profile => profile.nba;',
  '@/lib/nflAccess': 'export const requireNflAccess = async () => ({userId: globalThis.researchSettingsFixture.nflUser});',
  '@/lib/researchPreferencesServer': `export const readResearchPreferences = async id => {
    globalThis.researchSettingsReads.push(['preferences', id]);
    return { preferences: globalThis.savedResearchSettings, available: globalThis.researchSettingsFixture.available };
  };`,
  '@/lib/supabase/nativeAccount': `export const requireNativeAccount = async req =>
    req.headers.get('authorization') === 'Bearer member' ? { userId: '${owner}' } : { error: Response.json({}, { status: 401 }) };`,
  '@/lib/supabase/admin': `export const createAdminClient = () => ({
    from(table) { globalThis.researchSettingsReads.push(table); return this },
    select() { return this },
    eq(column, id) { globalThis.researchSettingsReads.push([column, id]); return this },
    async maybeSingle() { return { data: {nba: globalThis.researchSettingsFixture.nba}, error: null } },
  });`,
}
const bundle = await build({
  entryPoints: ['src/app/api/mobile/account/research-preferences/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'research-settings-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => Object.hasOwn(stubs, args.path) ? { path: args.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path] }))
  } }],
})
const module = { exports: {} as typeof import('../src/app/api/mobile/account/research-preferences/route') }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const get = (member: boolean) => module.exports.GET(new Request(`https://fixture.invalid/api/mobile/account/research-preferences?user=${other}`, {
  headers: member ? { authorization: 'Bearer member' } : {},
}))

type Settings = {
  preferences: ResearchPreferences
  defaults: ResearchPreferences
  books: { id: string; label: string }[]
  launchPages: { id: string; eligible: boolean }[]
}

test('research defaults require sign-in and reads are confined to the verified member', async () => {
  assert.equal((await get(false)).status, 401)
  assert.deepEqual(reads, [])
  const response = await get(true)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  const result: Settings = await response.json()
  assert.deepEqual(result.preferences, saved)
  assert.equal(result.defaults.primaryBook, null)
  assert.ok(result.books.some(book => book.id === 'caesars' && book.label === 'Caesars'))
  assert.equal(result.launchPages.find(page => page.id === 'nba-odds-board')?.eligible, false)
  assert.deepEqual(reads, [['preferences', owner], 'users', ['id', owner]])
})

test('NBA and NFL options reuse current access, including exact NFL user validation', async () => {
  fixture.nba = true
  fixture.nflUser = other
  const unrelated: Settings = await (await get(true)).json()
  assert.equal(unrelated.launchPages.find(page => page.id === 'nba-odds-board')?.eligible, true)
  assert.equal(unrelated.launchPages.find(page => page.id === 'nfl-odds-board')?.eligible, false)
  fixture.nflUser = owner
  const result: Settings = await (await get(true)).json()
  assert.equal(result.launchPages.find(page => page.id === 'nfl-odds-board')?.eligible, true)
  fixture.available = false
  assert.equal((await get(true)).status, 503)
})
