import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const bindings: Record<string, string> = {
  'next/cache': 'export const unstable_cache = loader => loader',
  '@slipsurge/core/mlbSchedule': `export async function getTodaysMatchups() { return globalThis.slateFixture.games }
    export async function fetchTeamPitcherIds() { throw new Error('Unexpected current staff lookup') }`,
  '@/lib/dugoutData': `export async function getMlbResearchGame(date, id) { return globalThis.slateFixture.games.find(game => game.gamePk === id) }
    export async function loadDugoutData(request, options) {
      const fixture = globalThis.slateFixture
      if (!fixture.pendingRoster) throw new Error('Unexpected new pregame observation')
      fixture.warmed.push(options)
      fixture.board = fixture.pendingRoster
      return Response.json({})
    }`,
  '@/lib/featuredGame': 'export const getFeaturedGameKey = async () => "CHC@BOS"',
  '@/lib/mlbOffseason': 'export const MLB_HIBERNATING = false',
  '@/lib/mlbViewerAccess': 'export const canViewMlb = async () => true',
  '@/lib/requireTier': 'export async function getEffectiveTier() { return { userId: "fixture", tier: globalThis.slateFixture.tier } }',
  '@/lib/supabase/nativeAccount': `export async function requireNativeAccount(request) {
    return request.headers.get('authorization') === 'Bearer ready' ? { supabase: {}, userId: 'fixture' }
      : { error: Response.json({}, { status: 401 }) }
  }`,
  '@/lib/mlbPregameResearchData': `export class MlbPregameResearchUnavailable extends Error {}
    export const mlbPregameResearchOpen = () => globalThis.slateFixture.open === true
    export async function readMlbPregameResearch() { return globalThis.slateFixture.board }
    export async function mlbPregameResearch(game, load, resource) {
      const fixture = globalThis.slateFixture
      fixture.requested.push(resource)
      const sample = fixture.samples[resource]
      if (!sample) throw new MlbPregameResearchUnavailable()
      return sample
    }`,
  '@/lib/pitchLogFetch': 'export const fetchPlayerPitchRows = async () => { throw new Error("Unexpected present-day pitch read") }',
  '@/lib/supabase/admin': 'export const createAdminClient = () => ({})',
}

const bundle = await build({
  stdin: { contents: "export { GET } from './src/app/api/mobile/dugout/slate-breakdown/route'", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'cjs', tsconfig: 'tsconfig.json', external: ['next/server'],
  plugins: [{name: 'native-slate-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => args.path in bindings ? { path: args.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: bindings[args.path], loader: 'js' }))
  }}],
})
const fixture = { exports: {} as typeof import('../src/app/api/mobile/dugout/slate-breakdown/route') }
new Function('require', 'exports', 'module', bundle.outputFiles[0].text)(require, fixture.exports, fixture)
const date = '2026-09-25'
const makeGame = (gamePk: number, gameKey: string) => ({ gamePk, gameKey, gameDate: date + 'T23:00:00Z',
  homeAbbr: 'BOS', homeTeam: 'Boston Red Sox', awayAbbr: 'CHC', awayTeam: 'Chicago Cubs', awayTeamId: 112, homeTeamId: 111,
  awayPitcher: { id: 987, name: 'Present-day pitcher', hand: 'R' }, awayScore: 3, homeScore: 4,
  status: 'Final', abstractStatus: 'Final' })
const saved = { awayPitcher: { id: 381, name: 'Archived starter', hand: 'L' }, homePitcher: null,
  awayLineupConfirmed: true, homeLineupConfirmed: true, awayLineup: [],
  homeLineup: [{ mlb_id: 226, name: 'Archived batter', batting_order: 1, bats: 'R', position: 'LF', projected: false }] }
const read = (query = '', auth = true) => fixture.exports.GET(new Request(`https://slipsurge.invalid/api/mobile/dugout/slate-breakdown?date=${date}&${query}`, {
  headers: auth ? { authorization: 'Bearer ready' } : {},
}))
const observation = { observedAt: date + 'T20:50:00Z', startAt: date + 'T23:00:00Z', frozen: true }

test('feature tiers expose only the permitted matchup and require Basic for pitch logs', async () => {
  Object.assign(globalThis, { slateFixture: { tier: 'free', games: [makeGame(824703, 'CHC@BOS'), makeGame(824704, 'CHC@BOS-G2')],
    board: { value: saved, ...observation }, requested: [], samples: {} } })
  assert.equal((await read('', false)).status, 401)
  const games = await (await read()).json()
  assert.deepEqual(games.games.map((game: { locked: boolean }) => game.locked), [false, true])
  assert.equal(games.games[0].awayStarter, undefined)
  assert.equal((await read('view=matchup&game=824704')).status, 403)
  assert.equal((await read('view=starter&game=824703&side=away')).status, 403)
  assert.equal((await read('view=team&game=824703&side=away')).status, 403)
})

test('pregame returns the sealed roster and missing samples stay missing', async () => {
  const state = { tier: 'ultimate', games: [makeGame(824703, 'CHC@BOS')], board: { value: saved, ...observation },
    requested: [] as string[], samples: { 'slate-starter:381': { value: { rows: [{ game_pk: '800000', run_value: 0.25 }] }, ...observation } } }
  Object.assign(globalThis, { slateFixture: state })
  const matchup = await (await read('view=matchup&game=824703')).json()
  assert.equal(matchup.archive.frozen, true)
  assert.equal(matchup.roster.awayStarter.id, 381)
  assert.equal(matchup.roster.homeLineup[0].id, 226)
  assert.equal((await read('view=batter&game=824703&side=away&batter=999')).status, 404)
  const starter = await (await read('view=starter&game=824703&side=away')).json()
  assert.deepEqual(state.requested, ['slate-starter:381'])
  assert.deepEqual(starter.sample.rows, [{ game_pk: '800000', run_value: 0.25 }])
  const batter = await (await read('view=batter&game=824703&side=away&batter=226')).json()
  assert.equal(batter.archive.unavailable, true)
  assert.equal(batter.sample, null)
  const live = await (await read('mode=live')).json()
  assert.equal(live.liveUnavailable, true)
  assert.deepEqual(live.games, [])
})

test('an open matchup uses the existing one-game archive capture to obtain a missing roster', async () => {
  const state = { tier: 'basic', games: [makeGame(824703, 'CHC@BOS')], board: null, open: true,
    pendingRoster: { value: saved, ...observation, frozen: false }, warmed: [] as object[] }
  Object.assign(globalThis, { slateFixture: state })
  const before = await (await read('view=starter&game=824703&side=away')).json()
  assert.equal(before.sample, null)
  assert.deepEqual(state.warmed, [])
  const matchup = await (await read('view=matchup&game=824703')).json()
  assert.deepEqual(state.warmed, [{tier: 'ultimate', warmGameIds: [824703]}])
  assert.equal(matchup.roster.awayStarter.id, 381)
  assert.equal(matchup.archive.frozen, false)
})
