import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const batter = {
  mlb_id: 600000, name: 'Native fixture', team: 'LAD', batting_order: 1,
  position: 'RF', bats: 'L', projected: false, matrixMatches: [{ id: 'matrix', name: 'Power', color: '#27ae60' }],
  props: { sa: { fanduel: 255, caesars: 40 }, open: { saFd: 300, saCz: 310 } },
  statcast: { l3: { avgEv: 94.2 } },
  mechanics: { l3: { index: 88, rank: 1 } },
  pregameInputs: { saAvg: { fd: 300 } },
  research: { mmByWindow: { l3: 2 }, bookRankByWindow: { l3: 4 }, paperRankByWindow: { l3: 2 } },
}
const state = {
  allowed: true,
  tier: 'ultimate',
  userId: 'member',
  calls: [] as { query: Record<string, string>; tier: string }[],
  snapshot: { frozen: true, unavailable: false },
}
Object.assign(globalThis, { nativeDugoutFixture: state, nativeDugoutBatter: batter })

const stubs: Record<string, string> = {
  '@/lib/supabase/nativeAccount': `export async function requireNativeAccount(request) {
    if (request.headers.get('authorization') !== 'Bearer fixture') return {error:Response.json({}, {status:401})}
    return {supabase:{}, userId:'member'}
  }`,
  '@/lib/mlbViewerAccess': 'export async function canViewMlb() { return globalThis.nativeDugoutFixture.allowed }',
  '@/lib/requireTier': `export async function getEffectiveTier() {
    const state = globalThis.nativeDugoutFixture
    return { userId: state.userId, tier: state.tier }
  }`,
  '@/lib/dugoutData': `
    export const MARKET_BOOK_TO_OPEN_FIELD = { 'sa:fanduel': 'saFd', 'sa:caesars': 'saCz' }
    export async function loadDugoutData(request, gate) {
      const state = globalThis.nativeDugoutFixture
      const query = Object.fromEntries(new URL(request.url).searchParams)
      state.calls.push({query, tier:gate.tier})
      const batter = globalThis.nativeDugoutBatter
      const game = { gamePk:123, gameKey:'SEA@LAD', gameNum:1, gameDate:'2026-10-05T00:00:00Z',
        locked:false, status:'Final', detailedStatus:'Final', isVoid:false, venue:'Dodger Stadium',
        awayAbbr:'SEA', awayTeam:'Seattle Mariners', awayScore:2, homeAbbr:'LAD', homeTeam:'Los Angeles Dodgers', homeScore:4,
        awayLineup:[], homeLineup:[batter,{...batter,mlb_id:600001,projected:true}],
        homeLineupConfirmed:true, awayLineupConfirmed:false, homePitcher:null, awayPitcher:null, noHr:null,
        researchSnapshot:state.snapshot, outcomes:{600000:{h:1}}, _bdlDebug:{ private:'excluded' },
        pregameInputs:{communityPicks:[
          {player_name:batter.name,game_key:'SEA@LAD-G2',prop_type:'home_runs',picks:99},
          {player_name:batter.name,game_key:'SEA@LAD',prop_type:'home_runs',picks:30,movement:{previous:25,delta:5,capturedAt:'2026-10-04T18:00:00Z'}},
          {player_name:batter.name,game_key:'',prop_type:'home_runs',picks:10}
        ]}
      }
      return Response.json({date:query.date,games:[game]})
    }`,
}
const bundled = await build({
  stdin: { contents: 'export * from "./src/app/api/mobile/dugout/route"', resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'cjs', platform: 'node', tsconfig: 'tsconfig.json', external: ['next/server'],
  plugins: [{ name: 'native-dugout-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'js' }))
  } }],
})
const route = { exports: {} as typeof import('../src/app/api/mobile/dugout/route') }
new Function('require', 'module', 'exports', bundled.outputFiles[0].text)(createRequire(import.meta.url), route, route.exports)
const get = (params: string, authorized = true) => route.exports.GET(new Request(`https://slipsurge.invalid/api/mobile/dugout?${params}`,
  { headers: authorized ? { authorization: 'Bearer fixture' } : {} }))

test('MLB hibernation and matching member eligibility are checked before loading canonical data', async () => {
  assert.equal((await get('view=access', false)).status, 401)
  state.allowed = false
  assert.deepEqual(await (await get('view=access')).json(), { allowed: false })
  assert.equal((await get('date=2026-10-04')).status, 403)
  state.allowed = true
  assert.equal((await get('date=2026-02-31')).status, 400)
  assert.equal((await get('date=2026-10-04&mode=warm')).status, 400)
  state.userId = 'other'
  assert.equal((await get('date=2026-10-04')).status, 401)
  state.userId = 'member'
  assert.equal(state.calls.length, 0)
})

test('exact dated quotes and branding come from the canonical tier-scoped projection', async () => {
  const response = await get('date=2026-10-04&warmGameIds=123&research=0')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  const { games: [game], mode } = await response.json()
  assert.equal(mode, 'pregame')
  assert.deepEqual(state.calls.at(-1), { query: { date: '2026-10-04', mode: 'pregame', research: '1' }, tier: 'ultimate' })
  assert.match(game.home.logo, /lad\.png$/)
  assert.equal(game.home.primary, '#005A9C')
  assert.match(game.homeLineup[0].headshot, /600000\/headshot/)
  assert.equal(game._bdlDebug, undefined)
  assert.deepEqual(game.homeLineup[0].markets[0].quotes, [
    { book: 'fanduel', price: 255, opening: 300, line: null },
    { book: 'caesars', price: null, opening: 310, line: null },
  ])
  assert.deepEqual(game.homeLineup[0].mm, { l3: 2 })
  assert.equal(game.homeLineup[0].crowd.home_runs.count, 30)
  assert.equal(game.homeLineup[0].crowd.home_runs.movement.delta, 5)
  assert.equal(game.homeLineup[0].cost.homeRunVsSeason, -0.15)
  const live = await get('date=2026-10-04&mode=live')
  assert.equal((await live.json()).mode, 'live')
  assert.equal(state.calls.at(-1)?.query.mode, 'live')
})

test('missing historical inputs never yield a projected lineup, form, or Matrix results', async () => {
  state.snapshot = { frozen: true, unavailable: true }
  const { games: [game] } = await (await get('date=2026-10-04')).json()
  assert.equal(game.homeLineup.length, 1)
  const [player] = game.homeLineup
  assert.equal(player.mm, null)
  assert.equal(player.statcast, null)
  assert.equal(player.mechanics, null)
  assert.equal(player.cost.homeRunVsSeason, null)
  assert.deepEqual(player.matrixMatches, [])
  assert.equal(player.markets[0].quotes[0].opening, 300)
})

test('public activity and cost use distinct tier floors before exposing any figures', async () => {
  state.tier = 'basic'
  const basic = await (await get('date=2026-10-04')).json()
  assert.equal(basic.publicAccess, false)
  assert.equal(basic.games[0].homeLineup[0].crowd, null)
  assert.equal(basic.games[0].homeLineup[0].cost, null)
  state.tier = 'advanced'
  const advanced = await (await get('date=2026-10-04')).json()
  assert.equal(advanced.publicAccess, true)
  assert.equal(advanced.games[0].homeLineup[0].crowd.home_runs.count, 30)
  assert.equal(advanced.batterCostAccess, false)
  assert.equal(advanced.games[0].homeLineup[0].cost, null)
})
