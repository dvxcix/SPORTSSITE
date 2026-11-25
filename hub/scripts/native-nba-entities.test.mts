import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const home = { id: 1, full_name: 'Home team', abbreviation: 'ATL' }
const away = { id: 2, full_name: 'Away team', abbreviation: 'BOS' }
const game = { id: 42, date: '2026-11-25', home_team: home, visitor_team: away,
  datetime: '2026-11-26T00:00:00.000Z', status_state: 'final', home_team_score: 107, visitor_team_score: 98 }
const directoryPlayer = { player: { id: 12, first_name: 'Example', last_name: 'Player', team: home },
  image: 'https://example.com/headshot.png', games: [game], seasons: [], logs: [], teams: [home, away] }
const calls: unknown[] = []
const fixture = { allowed: true }
Object.assign(globalThis, { nativeEntitiesFixture: fixture, nativeEntitiesCalls: calls, directoryPlayer, nativeEntitiesGame: game })
const stubs: Record<string, string> = {
  'next/server': 'export const NextResponse = Response',
  '@/lib/paintAccess': `export const requirePaintAccess = async () => globalThis.nativeEntitiesFixture.allowed ? {} :
    { error: Response.json({}, { status: 403 }) };`,
  '@/lib/nbaDirectory': `export const getNbaPlayerEntity = async id => {
    globalThis.nativeEntitiesCalls.push(['player', id]); return id === 12 ? globalThis.directoryPlayer : null;
  }; export const getNbaTeamEntity = async id => { globalThis.nativeEntitiesCalls.push(['team', id]); return null; };`,
  '@/lib/nbaPaintData': `export const getPaintGame = async id => {
    globalThis.nativeEntitiesCalls.push(['game', id]); return globalThis.nativeEntitiesGame;
  };`,
}
const bundle = await build({
  entryPoints: ['src/app/api/mobile/court/entities/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'nba-entities-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => Object.hasOwn(stubs, args.path) ? { path: args.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path] }))
  } }],
})
const module = { exports: {} as typeof import('../src/app/api/mobile/court/entities/route') }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const get = (query: string) => module.exports.GET(new Request(`https://fixture.invalid/api/mobile/court/entities?${query}`))

test('NBA directory and exact matchups both require the canonical Court access gate', async () => {
  fixture.allowed = false
  assert.equal((await get('kind=player&id=12')).status, 403)
  assert.equal((await get('kind=team&id=1&game=42')).status, 403)
  assert.deepEqual(calls, [])
  fixture.allowed = true
  assert.equal((await get('kind=team&id=1&game=42&game=1')).status, 400)
})

test('directory includes canonical artwork and a matchup request cannot substitute current roster data', async () => {
  calls.length = 0
  const row = await get('kind=player&id=12')
  assert.equal(row.headers.get('cache-control'), 'private, no-store')
  assert.equal((await row.json()).player.headshot, directoryPlayer.image)
  const exact = await get('kind=player&id=12&game=42')
  const body = await exact.json()
  assert.equal(body.matchup.id, 42)
  assert.equal(body.matchup.date, '2026-11-25')
  assert.equal(body.matchup.homeScore, 107)
  assert.equal(body.player, undefined)
  assert.equal((await get('kind=team&id=13&game=42')).status, 404)
  assert.deepEqual(calls, [['player', 12], ['game', 42], ['game', 42]])
})
