import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { nbaEntityId, nbaPlayerSeasons, nbaResearchHref, searchNbaEntities, type NbaDirectory } from '../src/lib/nbaEntities.ts'
import type { PaintStat } from '../src/lib/nbaPaint.ts'

const knicks = { id: 20, full_name: 'New York Knicks', name: 'Knicks', abbreviation: 'NYK', conference: 'East' }
const directory: NbaDirectory = { teams: [knicks], players: [{ id: 447, first_name: 'Karl-Anthony', last_name: 'Towns', position: 'C', team: knicks }, { id: 2, first_name: 'José', last_name: 'Alvarado', position: 'G', team: knicks }] }
const stat = (id: number, changes: Partial<PaintStat> = {}): PaintStat => ({ id, player: { id: 447 }, team: { id: 20 }, game: { id, date: '2026-04-10', season: 2025, status: 'Final', home_team_id: 20, visitor_team_id: 2 }, min: '30:30', pts: 20, reb: 10, ast: 5, fg3m: 2, stl: 1, blk: 1, turnover: 2, fga: 10, fgm: 5, fg3a: 5, fta: 2, ftm: 2, ...changes })

test('NBA entity identifiers are positive bounded integers', () => {
  assert.equal(nbaEntityId('447'), 447)
  for (const value of ['0', '-1', '1.5', '../447', '1e2', '100000000000', 'NaN']) assert.equal(nbaEntityId(value), null)
})
test('NBA directory search matches normalized names and full team identities', () => {
  assert.deepEqual(searchNbaEntities(directory, 'Jose').players.map(player => player.id), [2])
  assert.deepEqual(searchNbaEntities(directory, 'Karl Anthony').players.map(player => player.id), [447])
  assert.equal(searchNbaEntities(directory, 'New York').teams[0]?.id, 20)
  assert.equal(searchNbaEntities(directory, 'NYK').players.length, 2)
  assert.deepEqual(searchNbaEntities(directory, '%'), { players: [], teams: [] })
})
test('history separates seasons and teams, deduplicates games, excludes DNP/live/postseason', () => {
  const played = stat(1), prior = stat(2, { team: { id: 16 }, game: { ...stat(2).game, season: 2024 } })
  const dnp = stat(3, { min: '0', pts: 0, reb: 0, ast: 0, fg3m: 0, stl: 0, blk: 0, turnover: 0, fga: 0, fgm: 0, fg3a: 0, fta: 0, ftm: 0 })
  const rows = nbaPlayerSeasons([played, { ...played, id: 999 }, prior, dnp, stat(4, { game: { ...stat(4).game, status: 'In Progress' } }), stat(5, { game: { ...stat(5).game, postseason: true } })])
  assert.deepEqual(rows.map(row => [row.season, row.games, row.teamIds]), [[2025, 1, [20]], [2024, 1, [16]]])
  assert.equal(rows[0].min, 30.5)
})
test('season shooting percentages weight attempts and missing values never become zero', () => {
  const rows = nbaPlayerSeasons([stat(1, { ast: null }), stat(2, { fgm: 1, fga: 2, fg3m: 1, fg3a: 1, ast: 3 })])
  assert.equal(rows[0].fgPct, 6 / 12)
  assert.equal(rows[0].threePct, 3 / 6)
  assert.equal(rows[0].ast, 3)
  assert.equal(nbaPlayerSeasons([stat(1, { ast: null })])[0].ast, null)
})
test('entity research links preserve the exact game date, player and requested tool', () => {
  const href = nbaResearchHref({ id: 123, date: '2026-10-20T00:00:00.000Z' }, 447, 'ladder')
  const query = new URL(href, 'https://www.slipsurge.com').searchParams
  assert.equal(query.get('game'), '123'); assert.equal(query.get('date'), '2026-10-20'); assert.equal(query.get('player'), '447'); assert.equal(query.get('panel'), 'ladder')
})

async function loadSearch(gate: () => Promise<unknown>, search: (query: string) => Promise<unknown>) {
  const source = await readFile(new URL('../src/app/api/search/nba/route.ts', import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const mod = { exports: {} as { GET: (request: Request) => Promise<Response> } }
  new Function('require', 'module', 'exports', output)((name: string) => {
    if (name === 'next/server') return { NextResponse: Response }
    if (name === '@/lib/paintAccess') return { requirePaintAccess: gate }
    if (name === '@/lib/nbaDirectory') return { searchNbaDirectory: search }
    throw new Error(`Unexpected import ${name}`)
  }, mod, mod.exports)
  return mod.exports.GET
}
test('NBA search denies members before touching the shared directory', async () => {
  let reads = 0
  const get = await loadSearch(async () => ({ error: Response.json({ error: 'Not available' }, { status: 403 }) }), async () => { reads++; return {} })
  assert.equal((await get(new Request('https://example.test/api/search/nba?q=Towns'))).status, 403)
  assert.equal(reads, 0)
})
test('admin NBA search is private, bounded and reports unavailable data honestly', async () => {
  let query = ''
  const get = await loadSearch(async () => ({ userId: 'admin' }), async value => { query = value; return { players: [], teams: [] } })
  const result = await get(new Request(`https://example.test/api/search/nba?q=${'a'.repeat(90)}`))
  assert.equal(query.length, 64); assert.equal(result.headers.get('Cache-Control'), 'private, no-store')
  const fail = await loadSearch(async () => ({ userId: 'admin' }), async () => { throw new Error('provider') })
  assert.equal((await fail(new Request('https://example.test/api/search/nba?q=Towns'))).status, 503)
})
