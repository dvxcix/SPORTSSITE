import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { nbaComposerGame } from '../src/lib/nbaComposer.ts'
import { gameCenterStatus, basketballQuarters } from '../src/lib/gameCenterPresentation.ts'
import { fetchFeedPage, feedSport } from '../src/lib/feedQuery.ts'
import type { PaintGame, PaintRoster, PaintProp } from '../src/lib/nbaPaint.ts'
import type { ESPNSummary } from '@slipsurge/core/espn-api'

async function compile(path: string, imports: Record<string, unknown>) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const target = { exports: {} as Record<string, any> }
  new Function('require','exports','module',code)((name: string) => { assert.ok(name in imports, name); return imports[name] }, target.exports, target)
  return target.exports
}

const home = { id: 1, abbreviation: 'BOS', full_name: 'Boston Celtics', name: 'Celtics' }
const away = { id: 2, abbreviation: 'DET', full_name: 'Detroit Pistons', name: 'Pistons' }
const game: PaintGame = { id: 123, date: '2026-10-20', datetime: '2026-10-20T23:00:00Z', status: 'scheduled', status_state: 'scheduled', season: 2026, period: 0, home_team: home, visitor_team: away, home_team_score: 0, visitor_team_score: 0 }
const roster: PaintRoster[] = [{ id: 42, first_name: 'Example', last_name: 'Player', position: 'G', team: home }]
const prop: PaintProp = { id: 1, game_id: 123, player_id: 42, vendor: 'fanduel', prop_type: 'points', line_value: '24.5', market: { type: 'over_under', over_odds: -110, under_odds: -115 }, updated_at: '2026-10-20T12:00:00Z' }

test('NBA composer preserves exact lines, sides, book and validation identities; fails closed after tipoff', () => {
  const result = nbaComposerGame(game, roster, [prop, { ...prop, id: 2, line_value: '25', market: { type: 'milestone', odds: 120 } }, { ...prop, id: 3, game_id: 999 }], Date.parse('2026-10-20T12:00:00Z'))
  assert.equal(result.status, 'Preview')
  assert.equal(result.players[0].player_id, 'bdl:42')
  assert.equal(result.players[0].mlb_id, null)
  assert.equal(result.players[0].markets.length, 2)
  assert.deepEqual(result.players[0].markets[0].offers, [{ vendor: 'fanduel', side: 'over', odds: -110 }, { vendor: 'fanduel', side: 'under', odds: -115 }])
  assert.equal(result.players[0].markets[1].line, 25)
  assert.equal(result.players[0].markets[1].offers[0].side, 'milestone')
  assert.equal(nbaComposerGame(game, roster, [prop], Date.parse(game.datetime!)).status, 'Started')
  assert.equal(nbaComposerGame({ ...game, datetime: null, status: 'unavailable' }, roster, [prop]).status, 'Started')
})

test('historical NBA summary controls final/live status and preserves overtime and missing quarter scores', () => {
  const summary = { header: { competitions: [{ status: { type: { state: 'post', shortDetail: 'Final/2OT' } }, competitors: [{ homeAway: 'home', team: home, score: '120', linescores: [{ value: 25 }, { value: 0 }, { value: 30 }, { value: 35 }, { value: 15 }, { value: 15 }] }] }] } } as unknown as ESPNSummary
  assert.deepEqual(gameCenterStatus(summary, null, { state: 'pre', label: '', isLive: false }), { state: 'post', label: 'Final/2OT', isLive: false })
  assert.deepEqual(basketballQuarters(summary)[0].periods, [25, 0, 30, 35, 15, 15])
  summary.header.competitions[0].status.type.state = 'in'
  assert.equal(gameCenterStatus(summary, null, { state: 'pre', label: '', isLive: false }).isLive, true)
  assert.deepEqual(basketballQuarters(null), [])
})

test('NBA market endpoint checks research membership before touching schedule or providers', async () => {
  let reads = 0
  const api = await compile('../src/app/api/composer/nba-games/route.ts', {
    'next/server': { NextResponse: { json: Response.json } }, '@/lib/paintAccess': { requirePaintAccess: async () => ({ error: Response.json({}, { status: 403 }) }) },
    '@/lib/nbaPaintData': { getPaintSchedule: () => { reads++; throw new Error('Unauthorized read') } }, '@/lib/nbaComposer': { nbaComposerGame },
    '@/lib/nbaDirectory': { hydrateNbaPlayers: () => { reads++; throw new Error('Unauthorized read') } },
  })
  assert.equal((await api.GET(new Request('https://test'))).status, 403)
  assert.equal(reads, 0)
})

test('ordinary members can search NBA favorites without receiving research, and guests cannot read the directory', async () => {
  let signedIn = false, reads = 0
  const api = await compile('../src/app/api/account/favorites/players/route.ts', {
    'next/server': { NextResponse: { json: Response.json } }, '@/lib/requireTier': { resolveAuthedClient: async () => ({ userId: signedIn ? 'free-member' : null }) },
    '@/lib/nbaDirectory': { searchNbaDirectory: async () => { reads++; return { players: [{ id: 42, name: 'Example Player' }], teams: ['internal'] } } },
  })
  const request = new Request('https://test?q=Example')
  assert.equal((await api.GET(request)).status, 401); assert.equal(reads, 0)
  signedIn = true
  const response = await api.GET(request)
  assert.equal(response.status, 200); assert.equal(reads, 1)
  assert.deepEqual(await response.json(), { players: [{ id: 42, name: 'Example Player' }] })
})

test('league feed filters apply to top/latest posts and reposts without changing cursor boundaries', async () => {
  for (const filter of ['latest', 'top'] as const) {
    let sportApplied = false
    const raw = [{ id: 'nba', sport: 'NBA', author_id: 'a', created_at: '2026-10-20T10:00:00Z' }, { id: 'nfl', sport: 'NFL', author_id: 'b', created_at: '2026-10-20T09:00:00Z' }]
    const client: any = { from: (table: string) => {
      let sport: string | undefined
      const query: any = { select: () => query, order: () => query, limit: () => query, range: () => query,
        ilike: (key: string, value: string) => { assert.equal(key, 'sport'); sportApplied = true; sport = value; return query },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: table === 'posts' ? raw.filter(post => !sport || post.sport === sport) : [{ created_at: '2026-10-20T11:00:00Z', reposted_by: { id: 'r' }, post: raw[1] }] })),
      }; return query
    } }
    const result = await fetchFeedPage(client, { filter, sport: 'NBA', userId: null, blockedIds: [], pageSize: 2 })
    assert.equal(sportApplied, true)
    assert.deepEqual(result.posts.map(post => post.id), ['nba'])
    assert.equal(result.hasMore, false)
  }
  assert.equal(feedSport('nba'), 'NBA'); assert.equal(feedSport('SQL%'), undefined)
})

test('NBA score-to-research links require one exact date and two-team match, including alternate abbreviations', async () => {
  let rows = [{ payload: game }]
  const query: any = { select: () => query, eq: (key: string, date: string) => { assert.equal(key, 'game_date'); assert.equal(date, '2026-10-20'); return query }, limit: () => query, abortSignal: async () => ({ data: rows, error: null }) }
  const module = await compile('../src/lib/nbaGameReference.ts', { 'server-only': {}, '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => query }) } })
  const summary = { header: { competitions: [{ date: game.datetime, competitors: [{ homeAway: 'home', team: home }, { homeAway: 'away', team: away }] }] } }
  assert.deepEqual(await module.nbaGameReference(summary, null), { id: '123', date: '2026-10-20' })
  rows = [{ payload: game }, { payload: { ...game, id: 124 } }]
  assert.equal(await module.nbaGameReference(summary, null), null)
  rows = [{ payload: { ...game, visitor_team: { ...away, abbreviation: 'NYK' } } }]
  assert.equal(await module.nbaGameReference(summary, null), null)
  summary.header.competitions[0].competitors[1].team = { ...away, abbreviation: 'NY' }
  assert.deepEqual(await module.nbaGameReference(summary, null), { id: '123', date: '2026-10-20' })
})
