import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const fixture = { allowed: true, plan: true, reads: [] as string[], wrongIdentity: false }
Object.assign(globalThis, { nativeTeamFixture: fixture })
const stubs: Record<string, string> = {
  'next/server': 'export const NextResponse = Response;',
  '@/lib/mlbViewerAccess': 'export const canViewMlb = async () => globalThis.nativeTeamFixture.allowed;',
  '@/lib/requireTier': `export const requireTier = async () => globalThis.nativeTeamFixture.plan
    ? {userId:'member'} : {error:Response.json({}, {status:403})};`,
  '@/lib/supabase/nativeAccount': `export const requireNativeAccount = async req => req.headers.has('authorization')
    ? {supabase:{},userId:'member'} : {error:Response.json({}, {status:401})};`,
}
const bundle = await build({
  entryPoints: ['src/app/api/mobile/dugout/team/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'team-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, arg => Object.hasOwn(stubs, arg.path) ? { path: arg.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, arg => ({ contents: stubs[arg.path] }))
  } }],
})
const module = { exports: {} as typeof import('../src/app/api/mobile/dugout/team/route') }
const player = { person: { id: 10, fullName: 'Fixture Player' }, position: { type: 'Outfielder', name: 'Center Fielder' }, jerseyNumber: '8' }
const fetchTeam = async (url: string) => {
  fixture.reads.push(url)
  return url.includes('/roster') ? Response.json({ roster: [player, player, { person: { id: 0 } }] }) : Response.json({
    teams: [{ id: fixture.wrongIdentity ? 111 : 147, name: 'New York Yankees', abbreviation: 'NYY', venue: { name: 'Yankee Stadium' } }],
  })
}
new Function('require', 'module', 'exports', 'fetch', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports, fetchTeam)
const get = (query = 'id=147', member = true) => module.exports.GET(new Request(`https://fixture.invalid/api/mobile/dugout/team?${query}`, {
  headers: member ? { authorization: 'Bearer fixture' } : {},
}))

test('team roster requires a member, Basic access, and an enabled league', async () => {
  assert.equal((await get('id=147', false)).status, 401)
  fixture.plan = false
  assert.equal((await get()).status, 403)
  fixture.plan = true
  fixture.allowed = false
  assert.equal((await get()).status, 403)
  fixture.allowed = true
  assert.equal((await get('id=147&id=111')).status, 400)
  assert.deepEqual(fixture.reads, [])
})

test('team roster resolves the exact official team and deduplicates real player IDs', async () => {
  fixture.wrongIdentity = true
  assert.equal((await get()).status, 404)
  fixture.wrongIdentity = false
  const session = await get()
  const team = await session.json()
  assert.equal(session.headers.get('cache-control'), 'private, no-store')
  assert.equal(team.id, 147)
  assert.equal(team.venue, 'Yankee Stadium')
  assert.equal(team.logo, 'https://a.espncdn.com/i/teamlogos/mlb/500/nyy.png')
  assert.deepEqual(team.roster.map((row: { id: number; name: string; group: string }) => [row.id, row.name, row.group]), [[10, 'Fixture Player', 'Outfielder']])
  assert.ok(fixture.reads.includes('https://statsapi.mlb.com/api/v1/teams/147/roster?rosterType=active'))
})
