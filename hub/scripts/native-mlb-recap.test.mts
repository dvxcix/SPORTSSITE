import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const game = { gamePk: 824703, gameKey: 'CHC@BOS', gameNum: 1, gameDate: '2026-09-25T19:10:00Z', status: 'Final',
  awayAbbr: 'CHC', homeAbbr: 'BOS', awayTeam: 'Chicago Cubs', homeTeam: 'Boston Red Sox', awayLineup: [], homeLineup: [],
  awayPitcher: null, homePitcher: null, researchSnapshot: { unavailable: true, frozen: true }, outcomes: {} }
const hit = { game_pk: game.gamePk, mlb_id: 1, player_name: 'Fixture Hitter', pitcher_name: 'Fixture Pitcher', ab_index: 41,
  inning: 5, half: 'top', desc: 'Fixture home run', exit_velocity: 105.9, launch_angle: 30, hit_distance: 421,
  rbi_on_play: 2, is_first_hr_of_game: true, is_grand_slam: false }
const fixture = { tier: 'ultimate', reads: 0, board: { date: '2026-09-25', games: [game], hrFeed: [hit, { ...hit, game_pk: 824704 }] } }
Object.assign(globalThis, { nativeRecapFixture: fixture })
const stubs: Record<string, string> = {
  'next/server': 'export const NextResponse = Response;',
  '@/lib/dugoutData': `export const MARKET_BOOK_TO_OPEN_FIELD = {}; export const loadDugoutData = async () => {
    const state = globalThis.nativeRecapFixture; state.reads++; return Response.json(state.board);
  };`,
  '@/lib/mlbViewerAccess': 'export const canViewMlb = async () => true;',
  '@/lib/requireTier': 'export const getEffectiveTier = async () => ({ userId: "fixture", tier: globalThis.nativeRecapFixture.tier });',
  '@/lib/supabase/nativeAccount': `export const requireNativeAccount = async req => req.headers.has('authorization')
    ? { supabase: {}, userId: 'fixture' } : { error: Response.json({}, {status: 401}) };`,
}
const bundle = await build({
  entryPoints: ['src/app/api/mobile/dugout/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'recap-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, arg => Object.hasOwn(stubs, arg.path) ? { path: arg.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, arg => ({ contents: stubs[arg.path] }))
  } }],
})
const module = { exports: {} as typeof import('../src/app/api/mobile/dugout/route') }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const get = (query = '', member = true) => module.exports.GET(new Request(`https://fixture.invalid/api/mobile/dugout?date=2026-09-25${query}`, {
  headers: member ? { authorization: 'Bearer fixture' } : {},
}))

test('the Ultimate recap accepts no guest, lower tier or live request', async () => {
  assert.equal((await get('&view=recap', false)).status, 401)
  fixture.tier = 'advanced'
  assert.equal((await get('&view=recap')).status, 403)
  fixture.tier = 'ultimate'
  assert.equal((await get('&view=recap&mode=live')).status, 403)
  assert.equal(fixture.reads, 0)
})

test('official home run outcomes stay scoped to the exact slate, including without a mechanics archive', async () => {
  const standard = await (await get()).json()
  assert.equal(standard.homeRuns, undefined)
  const response = await get('&view=recap')
  const data = await response.json()
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal(data.games[0].snapshot.unavailable, true)
  assert.deepEqual(data.homeRuns, [{ gameId: game.gamePk, playerId: 1, playerName: 'Fixture Hitter', pitcherName: 'Fixture Pitcher',
    atBat: 41, inning: 5, half: 'top', description: 'Fixture home run', exitVelocity: 105.9, launchAngle: 30, distance: 421,
    runs: 2, firstHomeRun: true, grandSlam: false }])
})
