import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const stubs: Record<string, string> = {
  'server-only': '',
  '@/lib/supabase/client': 'export function createClient() { throw new Error("Unexpected browser client") }',
  '@/lib/mlbComposerGames': 'export async function loadMlbComposerGames() { return {games: []} }',
  '@/app/api/mobile/dugout/route': `export async function GET(request) {
    if (request.headers.get('authorization') !== 'Bearer test-account') return Response.json({}, {status: 401})
    if (new URL(request.url).searchParams.get('mode') !== 'pregame') throw new Error('Expected pregame board')
    return Response.json(globalThis.mlbWatchlistFixture)
  }`,
}
const bundle = await build({
  stdin: {
    contents: `export * from './src/lib/nativeMlbPickMarkets'; export * from './src/lib/nativeMlbResearchWatchlist'`,
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, write: false, format: 'cjs', platform: 'node', tsconfig: 'tsconfig.json',
  plugins: [{ name: 'mlb-market-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'js' }))
  } }],
})
const fixtureModule = { exports: {} as typeof import('../src/lib/nativeMlbPickMarkets') & typeof import('../src/lib/nativeMlbResearchWatchlist') }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, fixtureModule, fixtureModule.exports)
const { nativeMlbMarkets, findNativeMlbPick, nativeMlbResearchWatchlist } = fixtureModule.exports

test('tracked markets retain each verified sportsbook threshold and reject ungradable quotes', () => {
  const markets = nativeMlbMarkets({
    hrr: { fanduel: 150, draftkings: 115, betmgm: 190 }, hrr_line: { fanduel: 0.5, draftkings: 2.5 },
    hrr3: { draftkings: 115 }, moonshot: { fanduel: 1500 }, sa: { fanduel: 220, betmgm: 0 },
    pitcher_strikeouts: { fanduel: 125, draftkings: 170, betmgm: 115, caesars: 120 },
    pitcher_strikeouts_line: { fanduel: 4.5, draftkings: 5.5, betmgm: 5 },
  })
  assert.deepEqual(markets.filter(item => item.key === 'hrr').flatMap(item => item.offers), [{ vendor: 'fanduel', side: 'milestone', odds: 150 }])
  assert.equal(markets.find(item => item.key === 'hrr3')?.offers[0].vendor, 'draftkings')
  assert.deepEqual(markets.filter(item => item.key === 'pitcher_strikeouts').map(item => [item.line, item.offers.map(offer => offer.vendor)]),
    [[4.5, ['fanduel']], [5.5, ['draftkings']]])
  assert.equal(markets.find(item => item.key === 'sa')?.offers.length, 1)
  assert.ok(!markets.some(item => item.key === 'moonshot'))
})

test('exact native MLB leg checks identify the player, quote and first pitch', () => {
  const markets = nativeMlbMarkets({ sa: { fanduel: 220 } })
  const game = { gameKey: 'CHC@BOS', gamePk: '812341', gameDate: '2027-06-01', gameTime: new Date(Date.now() + 60_000).toISOString(),
    homeAbbr: 'BOS', awayAbbr: 'CHC', homeTeam: 'Boston Red Sox', awayTeam: 'Chicago Cubs', homeLogo: undefined, awayLogo: undefined,
    status: 'Preview', players: [{ player_id: 'mlb:12', mlb_id: 12, name: 'Fixture Hitter', team: 'BOS', position: 'CF',
      headshot_url: 'https://img.mlbstatic.com/fixture.png', teamLogo: undefined, colors: [], markets }] }
  const leg = { game_pk: game.gamePk, player_id: 'mlb:12', mlb_id: 12, player_name: 'Fixture Hitter', team: 'BOS',
    prop_key: 'sa', market_side: 'milestone', book: 'fanduel', odds: 220 }
  assert.ok(findNativeMlbPick([game], leg))
  assert.equal(findNativeMlbPick([game], { ...leg, odds: 210 }), null)
  assert.equal(findNativeMlbPick([game], { ...leg, game_pk: '812342' }), null)
  assert.equal(findNativeMlbPick([game], { ...leg, player_id: 'mlb:13' }), null)
  assert.equal(findNativeMlbPick([{ ...game, gameTime: new Date(Date.now() - 1000).toISOString() }], leg), null)
})

test('archived Watchlist checks the signed-in pregame board and exact doubleheader quote', async () => {
  const date = '2026-09-25'
  const game = { id: 824703, isVoid: false, home: { code: 'BOS' }, away: { code: 'CHC' }, homePitcher: null, awayPitcher: null,
    homeLineup: [], awayLineup: [{ id: 12, name: 'Fixture Hitter', position: 'CF', bats: 'L', headshot: 'https://img.mlbstatic.com/player',
      markets: [{ key: 'sa', label: 'Anytime Home Run', quotes: [{ book: 'fanduel', price: null, opening: 350, line: null }] }] }] }
  Object.assign(globalThis, { mlbWatchlistFixture: { date, games: [game, { ...game, id: 824706, awayLineup: [] }] } })
  const input = { date, gameId: game.id, playerId: 12, market: 'sa', book: 'fanduel', price: 350 }
  const endpoint = 'https://slipsurge.invalid/api/mobile/research-library'
  const request = new Request(endpoint, { headers: { authorization: 'Bearer test-account' } })
  const confirmation = await nativeMlbResearchWatchlist(request, input)
  assert.equal(confirmation.value?.player_name, 'Fixture Hitter')
  assert.equal(confirmation.value?.team, 'CHC')
  assert.deepEqual(confirmation.value?.odds_by_book, { fanduel: 350 })
  assert.equal((await nativeMlbResearchWatchlist(request, { ...input, price: 3500 })).status, 409)
  assert.equal((await nativeMlbResearchWatchlist(request, { ...input, gameId: 824706 })).status, 409)
  assert.equal((await nativeMlbResearchWatchlist(new Request(endpoint), input)).response?.status, 401)
})
