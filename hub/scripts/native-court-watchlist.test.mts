import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const commands: unknown[][] = []
const fixture = {
  database: {
    from(table: string) { commands.push(['from', table]); return this },
    select(columns: string) { commands.push(['select', columns]); return this },
    eq(field: string, value: string) { commands.push(['eq', field, value]); return this },
    ilike(field: string, value: string) { commands.push(['ilike', field, value]); return this },
    order(field: string) { commands.push(['order', field]); return this },
    async limit(cap: number) {
      commands.push(['limit', cap])
      return { data: [{ id: 'fixture', prop_key: 'nba:85:rebounds:over_under:7.5:under', book: 'draftkings' }] }
    },
  },
}
Object.assign(globalThis, { courtWatchlistFixture: fixture })
const stubs: Record<string, string> = {
  'next/server': 'export const NextResponse = Response;',
  '@/lib/blocks': 'export const getBlockedEitherWayIds = () => []; export const isAccountId = () => true;',
  '@/lib/mlbViewerAccess': 'export const canViewMlb = () => false;',
  '@/lib/nativeWatchlist': 'export const nativeSavedMarket = () => null;',
  '@/lib/nativeMlbResearchWatchlist': 'export const nativeMlbResearchWatchlist = () => null;',
  '@slipsurge/core/mlbTeamColors': 'export const getTeamLogoPngUrl = () => null; export const MLB_TEAM_COLORS = {}; export const MLB_TEAM_SECONDARY_COLORS = {};',
  '@/lib/researchWorkspaceServer': 'export const loadResearchWorkspace = () => { throw Error("unexpected broad lookup") };',
  '@/lib/slateEdgeEvidence': 'export const isSlateEdgeEvidence = () => false;',
  '@/lib/sportTeamArtwork': 'export const sportTeamColors = () => []; export const sportTeamLogoUrl = () => null;',
  '@/lib/supabase/nativeAccount': `export const requireNativeAccount = async req => req.headers.has('authorization')
    ? {supabase:globalThis.courtWatchlistFixture.database,userId:'verified-owner'} : {error:Response.json({}, {status:401})};`,
}
const bundle = await build({
  entryPoints: ['src/app/api/mobile/research-library/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'watchlist-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, arg => Object.hasOwn(stubs, arg.path) ? { path: arg.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, arg => ({ contents: stubs[arg.path] }))
  } }],
})
const module = { exports: {} as typeof import('../src/app/api/mobile/research-library/route') }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const read = (id: string, member = true) => module.exports.GET(new Request('https://fixture.invalid/api/mobile/research-library?courtGame=' + id,
  { headers: member ? { authorization: 'Bearer fixture' } : {} }))

test('Court Watchlist lookup is confined to the verified owner and exact pending NBA game', async () => {
  assert.equal((await read('21718181', false)).status, 401)
  assert.equal((await read('21718181,123')).status, 400)
  assert.deepEqual(commands, [])
  const result = await read('21718181')
  assert.equal(result.status, 200)
  assert.equal((await result.json()).items[0].prop_key, 'nba:85:rebounds:over_under:7.5:under')
  assert.deepEqual(commands, [['from', 'watchlist_items'], ['select', 'id,prop_key,book'], ['eq', 'user_id', 'verified-owner'],
    ['eq', 'game_pk', '21718181'], ['eq', 'status', 'pending'], ['ilike', 'sport', 'nba'], ['order', 'id'], ['limit', 500]])
})
