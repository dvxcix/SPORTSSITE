import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const sources: Record<string, string> = {
  '@/lib/mlbOffseason': 'export let MLB_HIBERNATING = true; export function setOffseason(value) { MLB_HIBERNATING = value }',
  '@/lib/mlbViewerAccess': 'export async function canViewMlb() { return globalThis.synergyFixture.eligible }',
  '@/lib/requireTier': `export async function requireTier(floor) {
    if (floor !== 'ultimate') throw new Error('Expected Ultimate floor');
    return globalThis.synergyFixture.ultimate ? { userId: 'member' } : { error: Response.json({}, { status: 403 }) }
  }`,
  '@/lib/supabase/nativeAccount': `export async function requireNativeAccount(request) {
    return request.headers.get('authorization') === 'Bearer fixture-member'
      ? { supabase: {}, userId: 'member' } : { error: Response.json({}, {status: 401}) }
  }`,
  '@/app/api/synergy/today/route': `export async function GET() {
    globalThis.synergyFixture.reads++;
    return Response.json(globalThis.synergyFixture.board)
  }`,
}
const output = await build({
  stdin: { contents: "export {GET} from './src/app/api/mobile/dugout/synergy/route'; export {setOffseason} from '@/lib/mlbOffseason'",
    resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'cjs', platform: 'node', tsconfig: 'tsconfig.json', external: ['next/server'],
  plugins: [{ name: 'synergy-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => args.path in sources ? { path: args.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: sources[args.path], loader: 'js' }))
  } }],
})
const moduleFixture = { exports: {} as { GET: typeof import('../src/app/api/mobile/dugout/synergy/route').GET; setOffseason: (paused: boolean) => void } }
new Function('require', 'exports', 'module', output.outputFiles[0].text)(createRequire(import.meta.url), moduleFixture.exports, moduleFixture)
const { GET, setOffseason } = moduleFixture.exports
const read = (mode: string, signed = true) => GET(new Request(`https://slipsurge.invalid/api/mobile/dugout/synergy?mode=${mode}`,
  { headers: signed ? { authorization: 'Bearer fixture-member' } : {} }))

test('native Synergy requires the same account, MLB visibility, Ultimate, and explicit Live before delegated reads', async () => {
  const fixture = { eligible: true, ultimate: true, reads: 0, board: {
    games: [{ gameKey: 'CHC@BOS', awayAbbr: 'CHC', homeAbbr: 'BOS', abstractStatus: 'Live', awayScore: 2, homeScore: 1 }],
    matchups: [{ gameKey: 'CHC@BOS', lineupConfirmed: true, batterId: 11, pitcherId: 12, batterName: 'Fixture Batter',
      pitcherName: 'Fixture Pitcher', batterTeamAbbr: 'CHC', pitcherTeamAbbr: 'BOS', batterBats: 'L', pitcherHand: 'R',
      batterScore: 9, pitcherScore: 3, evidencePitchers: [{ game_date: '2026-09-14', pitcher_id: 51, batter_id: 11, opponent_id: 51,
        opponent_name: 'Fixture Opponent', opponent_team: 'ATL', pitch_type: 'FF', matchScore: 0.81, velocity: 96.8, hit_distance: 408 }], evidenceHitters: [] }],
  } }
  Object.assign(globalThis, { synergyFixture: fixture })
  assert.equal((await read('live', false)).status, 401)
  fixture.eligible = false
  assert.equal((await read('live')).status, 403)
  fixture.eligible = true
  fixture.ultimate = false
  assert.equal((await read('live')).status, 403)
  fixture.ultimate = true
  assert.equal((await read('fake')).status, 400)
  assert.equal((await (await read('live')).json()).paused, true)
  assert.equal(fixture.reads, 0)
  setOffseason(false)
  assert.deepEqual((await (await read('pregame')).json()).matchups, [])
  assert.equal(fixture.reads, 0)
  const result = await read('live')
  assert.equal(result.headers.get('cache-control'), 'private, no-store')
  const board = await result.json()
  assert.equal(fixture.reads, 1)
  assert.match(board.games[0].away.logo, /chc\.png$/)
  assert.equal(board.games[0].home.name, 'Boston Red Sox')
  assert.equal(board.matchups[0].batterScore, 9)
  assert.equal(board.matchups[0].evidenceAgainstPitchers[0].distance, 408)
  assert.equal(board.matchups[0].evidenceAgainstPitchers[0].match, 0.81)
})
