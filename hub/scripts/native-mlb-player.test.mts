import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const gate = `async () => globalThis.playerFixture.basic ? {} : { error: Response.json({}, { status: 403 }) }`
const stub: Record<string, string> = {
  '@/lib/supabase/nativeAccount': `export async function requireNativeAccount(request) {
    return request.headers.get('authorization') === 'Bearer fixture'
      ? { userId: 'fixture' } : { error: Response.json({}, { status: 401 }) }
  }`,
  '@/lib/requireTier': `export const requireTier = ${gate}`,
  '@/lib/mlbOffseason': 'export const MLB_HIBERNATING = true',
  '@/app/api/players/[id]/route': `export async function GET(request, {params}) {
    const { id } = await params
    globalThis.playerFixture.profileCalls.push(id)
    return (await (${gate})()).error ?? Response.json(globalThis.playerFixture.profile)
  }`,
  '@/app/api/players/[id]/pitch-log/route': `export async function GET() {
    return (await (${gate})()).error ?? Response.json(globalThis.playerFixture.log)
  }`,
  '@/app/api/players/[id]/today/route': 'export async function GET() { throw new Error("Unexpected live schedule request") }',
}
const bundle = await build({
  stdin: { contents: "export {GET} from './src/app/api/mobile/dugout/player/route'", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'cjs', tsconfig: 'tsconfig.json', external: ['next/server'],
  plugins: [{ name: 'player-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => args.path in stub ? { path: args.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stub[args.path], loader: 'js' }))
  } }],
})
const fixture = { exports: {} as typeof import('../src/app/api/mobile/dugout/player/route') }
new Function('require', 'exports', 'module', bundle.outputFiles[0].text)(require, fixture.exports, fixture)
const read = (search: string, auth = true) => fixture.exports.GET(new Request(`https://slipsurge.invalid/api/mobile/dugout/player?${search}`, {
  headers: auth ? { authorization: 'Bearer fixture' } : {},
}))

test('player profiles enforce member, exact ID, and the original Basic tier', async () => {
  const state = { profileCalls: [], basic: false, profile: { player: { mlb_id: 663611, current_team_abbr: 'LAD' },
    homeRuns: { hit: [{ pitcher_id: 592450 }], allowed: [{ batter_id: 665742 }] } } }
  Object.assign(globalThis, { playerFixture: state })
  assert.equal((await read('id=663611', false)).status, 401)
  assert.equal((await read('id=0663611')).status, 400)
  assert.equal((await read('id=663611&view=unknown')).status, 400)
  assert.deepEqual(state.profileCalls, [])
  assert.equal((await read('id=663611')).status, 403)
  assert.equal((await read('id=663611&view=today')).status, 403)
  state.basic = true
  const response = await read('id=663611')
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  const body = await response.json()
  assert.equal(body.player.mlb_id, 663611)
  assert.equal(body.team.code, 'LAD')
  assert.ok(body.team.logo.endsWith('/lad.png'))
  assert.match(body.headshot, /663611/)
  assert.match(body.opponents['592450'], /592450/)
  assert.equal(body.pitches.FF.label, '4-Seam')
  assert.equal((await read('id=592450')).status, 503)
  assert.deepEqual(await (await read('id=663611&view=today')).json(), { playingToday: false, context: null })
})

test('native pitch logs isolate roles and preserve exact and neutral spray venues', async () => {
  const batterRows = [{ opponent_id: 592450 }]
  const pitcherRows = [{ opponent_id: 665742 }]
  const sprayRows = [
    { opponent_id: 592450, home_team_id: 111, venue_id: 3, venue_name: 'Fenway Park', hc_x: 129.3, hc_y: 87.1 },
    { opponent_id: 592450, home_team_id: 111, venue_id: 5340, venue_name: 'Neutral venue', hc_x: 17.7, hc_y: 80.0 },
  ]
  Object.assign(globalThis, { playerFixture: { basic: true, log: { batterRows, pitcherRows, sprayRows, nearHrAvailable: false } } })
  assert.deepEqual((await (await read('id=663611&view=batting')).json()).rows, batterRows)
  assert.deepEqual((await (await read('id=663611&view=pitching')).json()).rows, pitcherRows)
  const spray = await (await read('id=663611&view=spray')).json()
  assert.equal(spray.nearHrAvailable, false)
  assert.equal(spray.rows[0].hc_x, 129.3)
  assert.equal(spray.parks[spray.rows[0].parkKey].team.code, 'BOS')
  assert.ok(spray.parks[spray.rows[0].parkKey].shape.outfield)
  assert.equal(spray.parks[spray.rows[1].parkKey].team, null)
  assert.equal(spray.parks[spray.rows[1].parkKey].shape, null)
})
