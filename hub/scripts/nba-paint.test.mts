import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { gradeNbaValue, nbaAverage, nbaDate, nbaHitRate, nbaMinutes, nbaName, nbaReference, nbaSample, nbaSelectionKey, nbaValue, parseNbaSelection, nbaWeightedRank, nbaTeamLogo, type PaintPlayer, type PaintStat, type PaintProp } from '../src/lib/nbaPaint.ts'
import { gradeNbaPick } from '../src/lib/nbaPickGrading.ts'
import { watchlistPickPayload } from '../src/lib/nflWatchlist.ts'

const stat = (value: number | null, date = '2026-04-01', minutes = '30:30'): PaintStat => ({ id: Number(date.replaceAll('-', '')), player: { id: 434 }, team: { id: 2 }, game: { id: 123, date, status: 'Final', status_state: 'final', home_team_id: 2, visitor_team_id: 9 }, min: minutes, pts: value, reb: 5, ast: 4, fg3m: 2, stl: 0, blk: 1, turnover: 2, fga: 15, fgm: 7, fg3a: 5, fta: 3, ftm: 2 })
const offer: PaintProp = { id: 99, game_id: 123, player_id: 434, prop_type: 'points', vendor: 'fanduel', line_value: '20', market: { type: 'over_under', over_odds: -110, under_odds: -105 }, updated_at: '2026-10-18T12:00:00Z' }

test('NBA samples preserve nulls, valid zeroes and exact combined markets', () => {
  assert.equal(nbaValue(stat(20), 'points_rebounds_assists'), 29)
  assert.equal(nbaValue(stat(0), 'points'), 0)
  assert.equal(nbaValue(stat(null), 'points'), null)
  assert.equal(nbaValue(stat(20), 'points_1q'), null)
  assert.equal(nbaMinutes('30:30'), 30.5)
  assert.equal(nbaMinutes(null), null)
  assert.equal(nbaMinutes('DNP'), null)
  assert.equal(nbaAverage([], 'points'), null)
})
test('DNPs are excluded, samples sort newest first, and venue uses the historical game team', () => {
  const logs = [stat(0, '2026-04-02', '0:00'), stat(20), stat(25, '2026-04-03')]
  assert.deepEqual(nbaSample(logs, 10).map(s => s.pts), [25, 20])
  assert.equal(nbaSample(logs, 10, 'away').length, 0)
  assert.equal(nbaSample(logs, 1, 'home')[0].pts, 25)
})
test('hit rates distinguish pushes, overs, unders and milestone equality', () => {
  const logs = [stat(20), stat(21), stat(19)]
  assert.deepEqual(nbaHitRate(logs, 'points', 20, 'over'), { wins: 1, pushes: 1, games: 3, rate: 50 })
  assert.equal(nbaHitRate(logs, 'points', 20, 'under').rate, 50)
  assert.equal(nbaHitRate(logs, 'points', 20, 'over', true).wins, 2)
  assert.equal(nbaHitRate([stat(null)], 'points', 20, 'over').rate, null)
})
test('reference lines use main markets and the most widely quoted numeric line', () => {
  const ladder = { ...offer, line_value: '10', market: { type: 'milestone' as const, odds: 200 } }
  const more = { ...offer, vendor: 'draftkings', line_value: '20.5' }
  assert.equal(nbaReference([ladder], 'points'), null)
  assert.equal(nbaReference([offer, more, { ...more, vendor: 'caesars' }], 'points')?.line_value, '20.5')
  assert.equal(nbaReference([offer, more], 'points', 'fanduel')?.vendor, 'fanduel')
})
test('NBA selections survive shared watchlist posting without becoming MLB or NFL', () => {
  const key = nbaSelectionKey(434, offer, 'under')
  assert.deepEqual(parseNbaSelection(key), { player_id: 'bdl:434', prop_key: 'points', numeric_line: 20, market_side: 'under', type: 'over_under' })
  const payload = watchlistPickPayload({ sport: 'nba', player_name: 'Player', prop_key: key, prop_label: 'Under 20 Points', game_pk: '123', book: 'fanduel', odds: -105 })
  assert.equal(payload.sport, 'NBA'); assert.equal(payload.player_id, 'bdl:434'); assert.equal(payload.numeric_line, 20); assert.equal(payload.prop_key, 'points')
  for (const invalid of ['nba:434:points:milestone:20:over', 'nba:434:points:over_under:NaN:under', 'nba:434:unknown:over_under:20:over', key + ':extra']) assert.equal(parseNbaSelection(invalid), null)
})
test('grading is final-only, ID-exact, supports pushes and milestone equality, and leaves DNP pending', () => {
  const pick = { id: 'p', post_id: null, game_pk: '123', player_id: 'bdl:434', player_name: 'Player', pick_type: 'points', numeric_line: 20, market_side: 'over' as const }
  assert.equal(gradeNbaPick(pick, [stat(20)]), 'push')
  assert.equal(gradeNbaPick(pick, [stat(21)]), 'win')
  assert.equal(gradeNbaPick(pick, [stat(19)]), 'loss')
  assert.equal(gradeNbaPick(pick, [stat(0, '2026-04-01', '0')]), null)
  assert.equal(gradeNbaPick({ ...pick, player_id: 'bdl:435' }, [stat(21)]), null)
  assert.equal(gradeNbaPick(pick, [{ ...stat(21), game: { ...stat(21).game, status_state: 'in_progress', status: '4th Qtr' } }]), null)
  assert.equal(gradeNbaValue(20, 20, 'milestone'), 'win')
  assert.equal(gradeNbaValue(null, 20, 'over'), null)
})
test('date and artwork identity normalization reject invalid dates and fuzzy name substitutions', () => {
  assert.equal(nbaDate('2026-02-30', '2026-10-20'), '2026-10-20')
  assert.equal(nbaName('Nikola Jokić'), nbaName('Nikola Jokic'))
  assert.equal(nbaName('Ron Harper Jr.'), nbaName('Ron Harper'))
  assert.notEqual(nbaName('Jalen Williams'), nbaName('Jaylin Williams'))
})

async function compiled(file: string, imports: Record<string, unknown>, fetcher: typeof fetch = fetch) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const target = { exports: {} as Record<string, (...args: never[]) => unknown> }
  new Function('require', 'exports', 'module', 'fetch', outputText)((name: string) => { assert.ok(name in imports, name); return imports[name] }, target.exports, target, fetcher)
  return target.exports
}
test('server authorization fails closed for guests, regular members and failed role reads', async () => {
  for (const [id, role, error, status] of [[null, null, null, 401], ['u', 'member', null, 403], ['u', 'admin', 'db error', 403], ['u', 'admin', null, undefined]] as const) {
    const gate = await compiled('../src/lib/paintAccess.ts', { 'server-only': {}, 'next/server': { NextResponse: { json: Response.json } }, '@/lib/requireTier': { resolveAuthedClient: async () => ({ userId: id, supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { account_type: role }, error }) }) }) }) } }) } })
    const result = await gate.requirePaintAccess() as { error?: Response; userId?: string }
    assert.equal(result.error?.status, status)
    if (!status) assert.equal(result.userId, id)
  }
})
test('posting rejects changed odds, opposite side, wrong book and wrong player', async () => {
  const validator = await compiled('../src/lib/nbaPickValidation.ts', { 'server-only': {}, './nbaPaintData': {}, './nbaPaint': {} })
  const leg = { player_id: 'bdl:434', game_pk: '123', book: 'fanduel', prop_key: 'points', numeric_line: 20, market_side: 'over', odds: -110 }
  const matches = validator.paintOfferMatches as unknown as (p: PaintProp, l: typeof leg) => boolean
  assert.equal(matches(offer, leg), true)
  for (const change of [{ odds: -109 }, { book: 'draftkings' }, { player_id: 'bdl:435' }, { market_side: 'under' }, { numeric_line: 20.5 }]) assert.equal(matches(offer, { ...leg, ...change }), false)
})


test('custom matrix ranks observed stats, preserves ties, and never invents missing samples', () => {
  const players = [10, 20, 30].map((pts, index) => ({ id: index + 1, first_name: 'Test', last_name: String(index), position: 'G', team: { id: 2, abbreviation: 'BOS', full_name: 'Boston Celtics', name: 'Celtics' }, average: { pts }, logs: [], props: [], headshot: null, injury: null })) satisfies PaintPlayer[]
  assert.equal(nbaWeightedRank(players[0], players, { pts: 100 }), 0)
  assert.equal(nbaWeightedRank(players[1], players, { pts: 100 }), 50)
  assert.equal(nbaWeightedRank(players[2], players, { pts: 100 }), 100)
  assert.equal(nbaWeightedRank(players[0], players, { pts: 0 }), null)
  assert.equal(nbaTeamLogo('BOS'), 'https://a.espncdn.com/i/teamlogos/nba/500/bos.png')
  assert.equal(nbaTeamLogo('GSW'), 'https://a.espncdn.com/i/teamlogos/nba/500/gs.png')
  assert.equal(nbaTeamLogo('../bad'), null)
})

test('provider samples bound dates, exclude future results, and expose truncated cursor coverage', async () => {
  const pure = await import('../src/lib/nbaPaint.ts')
  const team = { id: 2, abbreviation: 'BOS', full_name: 'Boston Celtics', name: 'Celtics' }
  const urls: string[] = []
  const fetcher: typeof fetch = async input => {
    const url = String(input); urls.push(url)
    let data: unknown[] = []
    if (url.includes('espn.com')) return Response.json({ athletes: [{ fullName: 'Test Player', headshot: { href: 'https://a.espncdn.com/test.png' } }] })
    if (url.includes('/players/active')) data = [{ id: 434, first_name: 'Test', last_name: 'Player', team, position: 'G' }]
    if (url.includes('/season_averages/general') && !url.includes('team_season')) data = [{ player: { id: 434 }, stats: { gp: url.includes('season=2026') ? 0 : 50, pts: 22, min: 30 } }]
    if (url.includes('/stats?')) return Response.json({ data: [stat(22), stat(100, '2026-10-19')], meta: { next_cursor: 1 } })
    return Response.json({ data, meta: { next_cursor: null } })
  }
  const adapter = await compiled('../src/lib/nbaPaintData.ts', { 'server-only': {}, '@/lib/balldontlie': { bdlHeaders: { Authorization: 'test-only' } }, './nbaPaint': pure }, fetcher)
  const board = await (adapter.getPaintBoard as unknown as (game: unknown) => Promise<import('../src/lib/nbaPaint.ts').PaintBoard>)({ id: 123, date: '2026-10-20', season: 2026, status: '2026-10-20T23:00:00Z', datetime: '2026-10-20T23:00:00Z', home_team: team, visitor_team: { ...team, id: 9, abbreviation: 'DET' } })
  assert.equal(board.sampleSeason, 2025)
  assert.equal(board.statsComplete, false)
  assert.ok(board.issues.some(i => i.includes('incomplete')), JSON.stringify({issues:board.issues,players:board.players.length,urls}))
  assert.equal(board.players[0].logs.length, 1)
  assert.equal(board.players[0].logs[0].pts, 22)
  assert.ok(urls.some(u => u.includes('end_date=2026-07-01')))
})
