import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { gradeNbaValue, nbaAverage, nbaDate, nbaHitRate, nbaMinutes, nbaName, nbaReference, nbaSample, nbaSelectionKey, nbaValue, parseNbaSelection, nbaWeightedRank, nbaTeamLogo, type PaintPlayer, type PaintStat, type PaintProp } from '../src/lib/nbaPaint.ts'
import { gradeNbaPick } from '../src/lib/nbaPickGrading.ts'
import type { WatchlistItem } from '../src/lib/watchlist.ts'
import { watchlistPickPayload } from '../src/lib/nflWatchlist.ts'
import { nbaMarketRanks } from '../src/lib/nbaMarketMetrics.ts'

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

test('MM compares the same priced roster, preserves ties and signs, and excludes missing samples', () => {
  const players = [30, 20, 10].map((pts, i) => ({ id: i + 1, first_name: 'Test', last_name: String(i), position: 'G', team: { id: 2, abbreviation: 'BOS', full_name: 'Boston Celtics', name: 'Celtics' }, average: { pts }, logs: Array.from({ length: 5 }, (_, n) => ({ ...stat(pts), id: n + 1 })), props: [{ ...offer, player_id: i + 1, line_value: String([10, 20, 30][i]) }], headshot: null, injury: null })) satisfies PaintPlayer[]
  const ranks = nbaMarketRanks(players, 'points')
  assert.equal(ranks.get(1)?.mm, 2); assert.equal(ranks.get(3)?.mm, -2)
  assert.equal(nbaMarketRanks(players, 'assists').size, 0)
  assert.equal(nbaMarketRanks(players.map(p => ({ ...p, logs: [] })), 'points').size, 0)
  const consensus = [{ ...offer, line_value: '15', vendor: 'fanduel' }, { ...offer, line_value: '20', vendor: 'fanduel' }, { ...offer, line_value: '20', vendor: 'draftkings' }]
  assert.equal(nbaReference(consensus, 'points', 'fanduel')?.line_value, '20')
})

test('save → post API → My Picks → final settlement preserves exact NBA identities', async () => {
  const pure = await import('../src/lib/nbaPaint.ts')
  const saved: Record<string, unknown>[] = [], posts: Record<string, unknown>[] = [], picks: Record<string, unknown>[] = []
  const client = { from: () => ({
    insert: (row: Record<string, unknown>) => ({ select: () => ({ single: async () => { const data = { id: 'saved-1', status: 'pending', ...row }; saved.push(data); return { data, error: null } } }) }),
    select: () => ({ eq: () => ({ order: async () => ({ data: saved, error: null }), in: () => { const query = { order: () => query, limit: () => query, or: () => Promise.resolve({ data: posts, error: null }) }; return query } }) }),
  }) }
  const provider = { getPaintGame: async () => ({ id: 123, date: '2099-10-20', datetime: '2099-10-20T20:00:00Z', status_state: 'scheduled', home_team: { id: 2 }, visitor_team: { id: 9 } }), getPaintProps: async () => [offer], getPaintIdentity: async () => ({ id: 434, first_name: 'Canonical', last_name: 'Player', team: { id: 2, abbreviation: 'BOS' } }) }
  const validation = await compiled('../src/lib/nbaPickValidation.ts', { 'server-only': {}, './nbaPaintData': provider, './nbaPaint': pure })
  const admin = { rpc: async (name: string, args: Record<string, unknown>) => {
    assert.equal(name, 'create_tracked_pick_post')
    posts.push({ id: 'post-1', ...(args.p_post as object) })
    picks.push(...(args.p_picks as object[]).map((row, i) => ({ ...row, id: `pick-${i}`, post_id: 'post-1' })))
    return { data: { id: 'post-1', pickIds: ['pick-0'], picksTracked: true }, error: null }
  } }
  const route = await compiled('../src/app/api/posts/pick/route.ts', {
    'next/server': { NextResponse: { json: Response.json } }, '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) } }) }, '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@slipsurge/core/mlbSchedule': {}, '@slipsurge/core/parlayCalc': { combineOdds: () => -110 }, '@/lib/watchlist': {}, '@/lib/mentions': { notifyMentions: async () => {} }, '@/lib/notify': { notifyFollowers: async () => {} }, '@/app/the-sideline/data': {}, '@/app/the-sideline/kickoff': {}, '@/lib/nflPickOffer': {}, '@/lib/nbaPickValidation': validation, '@/lib/paintAccess': { requirePaintAccess: async () => ({ userId: 'owner' }) },
  })
  const watchlist = await compiled('../src/lib/watchlist.ts', { '@/lib/supabase/client': { createClient: () => client }, '@slipsurge/core/parlayCalc': {}, './nflWatchlist': { watchlistPickPayload } }, async (_input, init) => await (route.POST as unknown as (request: Request) => Promise<Response>)(new Request('https://slipsurge.test/api/posts/pick', init)))
  const item = await (watchlist.addWatchlistItem as unknown as (owner: string, item: unknown) => Promise<WatchlistItem>)('owner', { sport: 'nba', player_name: 'Wrong name', team: 'OLD', game_pk: '123', game_date: '2099-10-20', prop_key: nbaSelectionKey(434, offer, 'over'), prop_label: 'Over 20 Points', line: '999', book: 'fanduel', odds: -110 })
  assert.equal((await (watchlist.fetchWatchlist as unknown as (owner: string) => Promise<WatchlistItem[]>)('owner')).length, 1)
  const posted = await (watchlist.postBetToFeed as unknown as (owner: string, items: WatchlistItem[]) => Promise<{ postId: string }>)('owner', [item])
  assert.equal(posted.postId, 'post-1'); assert.equal(picks[0].sport, 'NBA'); assert.equal(picks[0].player_id, 'bdl:434'); assert.equal(picks[0].numeric_line, 20); assert.equal(picks[0].line, '20'); assert.equal(picks[0].player_name, 'Canonical Player')
  const myPicks = await compiled('../src/lib/myPicks.ts', { '@/lib/supabase/client': { createClient: () => client } })
  assert.equal((await (myPicks.fetchMyPicks as unknown as (owner: string) => Promise<{ id: string }[]>)('owner'))[0].id, 'post-1')
  const settlement = await compiled('../src/lib/nbaSettlement.ts', { 'server-only': {}, './nbaPickGrading': { gradeNbaPick }, './nbaPaint': { nbaToday: () => '2099-10-20' }, './nbaPaintData': { getPaintGame: async () => ({ status_state: 'final' }), getPaintFinalStats: async () => ({ complete: true, rows: [stat(21)] }) } })
  const chain = { select: () => chain, eq: () => chain, not: () => chain, lte: () => chain, order: () => chain, limit: async () => ({ data: picks, error: null }) }
  const settled = await (settlement.settleNbaPicks as unknown as (client: unknown) => Promise<{ graded: number }>)({ from: () => chain, rpc: async (name: string, args: Record<string, unknown>) => { assert.equal(name, 'settle_nba_pick_exact'); assert.deepEqual(args, { p_pick_id: 'pick-0', p_result: 'win' }); return { data: true, error: null } } })
  assert.equal(settled.graded, 1)
})

test('NBA posting fails closed for stale quotes, started games, duplicates, mixed books and unavailable data', async () => {
  const pure = await import('../src/lib/nbaPaint.ts')
  const leg = { player_id: 'bdl:434', player_name: 'Test', team: 'BOS', game_pk: '123', game_date: '2099-10-20', book: 'fanduel', prop_key: 'points', prop_label: 'Points', numeric_line: 20, market_side: 'over', odds: -110 }
  for (const scenario of ['changed', 'started', 'duplicate', 'mixed', 'missing', 'valid']) {
    const validator = await compiled('../src/lib/nbaPickValidation.ts', { 'server-only': {}, './nbaPaint': pure, './nbaPaintData': {
      getPaintGame: async () => ({ id: 123, datetime: scenario === 'started' ? '2000-01-01T00:00:00Z' : '2099-10-20T20:00:00Z', date: '2099-10-20', status_state: 'scheduled', home_team: { id: 2 }, visitor_team: { id: 9 } }),
      getPaintProps: async () => { if (scenario === 'missing') throw new Error('unavailable'); return [{ ...offer, market: { ...offer.market, over_odds: scenario === 'changed' ? -111 : -110 } }] },
      getPaintIdentity: async () => ({ first_name: 'Test', last_name: 'Player', team: { id: 2, abbreviation: 'BOS' } }),
    } })
    const legs = scenario === 'duplicate' ? [{ ...leg }, { ...leg }] : scenario === 'mixed' ? [{ ...leg }, { ...leg, player_id: 'bdl:435', book: 'draftkings' }] : [{ ...leg }]
    const error = await (validator.validatePaintPickLegs as unknown as (legs: unknown[]) => Promise<string | null>)(legs)
    if (scenario === 'valid') assert.equal(error, null); else assert.equal(typeof error, 'string', scenario)
  }
})

test('NBA settlement never writes from partial, live, mismatched, missing or failed provider data', async () => {
  for (const scenario of ['partial', 'live', 'identity', 'missing', 'provider', 'rpc']) {
    let calls = 0
    const pending = { id: 'p', game_pk: '123', player_id: 'bdl:434', pick_type: 'points', numeric_line: 20, market_side: 'over' }
    const chain = { select: () => chain, eq: () => chain, not: () => chain, lte: () => chain, order: () => chain, limit: async () => ({ data: [pending], error: null }) }
    const settlement = await compiled('../src/lib/nbaSettlement.ts', { 'server-only': {}, './nbaPickGrading': { gradeNbaPick }, './nbaPaint': { nbaToday: () => '2099-10-20' }, './nbaPaintData': {
      getPaintGame: async () => { if (scenario === 'provider') throw new Error('provider'); return { status_state: scenario === 'live' ? 'in_progress' : 'final' } },
      getPaintFinalStats: async () => ({ complete: scenario !== 'partial', rows: scenario === 'missing' ? [] : [{ ...stat(21), player: { id: scenario === 'identity' ? 999 : 434 } }] }),
    } })
    const report = await (settlement.settleNbaPicks as unknown as (client: unknown) => Promise<{ graded: number }> )({ from: () => chain, rpc: async () => { calls++; return { data: null, error: { message: 'write unavailable' } } } })
    assert.equal(report.graded, 0); assert.equal(calls, scenario === 'rpc' ? 1 : 0)
  }
})
