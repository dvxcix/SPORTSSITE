import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import type { PaintGame, PaintRoster } from '../src/lib/nbaPaint.ts'

async function compiled(file: string, imports: Record<string, unknown>, clock: DateConstructor = Date) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const target = { exports: {} as Record<string, unknown> }
  new Function('require', 'exports', 'module', 'Date', outputText)((name: string) => {
    assert.ok(name in imports, name); return imports[name]
  }, target.exports, target, clock)
  return target.exports
}
const home = { id: 24, abbreviation: 'PHX', full_name: 'Phoenix Suns', name: 'Suns' }
const away = { id: 25, abbreviation: 'POR', full_name: 'Portland Trail Blazers', name: 'Trail Blazers' }
const game: PaintGame = { id: 21717930, date: '2026-10-21', season: 2026, status: 'Scheduled', status_state: 'scheduled', datetime: '2026-10-22T02:00:00Z', period: 0, home_team: home, visitor_team: away, home_team_score: 0, visitor_team_score: 0 }
const player: PaintRoster = { id: 1046672580, first_name: 'Drew', last_name: 'Timme', position: 'F-C', height: '6-10', college: 'Gonzaga', jersey_number: '2', team: home }
type Identity = { id: number; team_id: number; payload: PaintRoster; fetched_at: string }
type Options = { known?: number[]; roster?: PaintRoster[]; readFail?: boolean; rosterFail?: boolean; writeFail?: boolean; race?: Identity }

async function harness(options: Options = {}) {
  const events: string[] = [], requested: number[][] = [], writes: Identity[][] = []
  const stored = new Map<number, Identity>((options.known ?? []).map(id => [id, { id, team_id: 25, payload: { ...player, id, team: away }, fetched_at: '2026-10-20T02:00:00Z' }]))
  const admin = { from: (table: string) => {
    assert.equal(table, 'nba_players')
    return {
      select: (columns: string) => {
        assert.equal(columns, 'id')
        return { in: (key: string, ids: number[]) => {
          assert.equal(key, 'id'); requested.push(ids)
          return { abortSignal: async (signal: AbortSignal) => {
            assert.ok(signal instanceof AbortSignal); events.push('read')
            return { data: ids.filter(id => stored.has(id)).map(id => ({ id })), error: options.readFail ? { code: 'DB' } : null }
          } }
        } }
      },
      upsert: (rows: Identity[], config: { onConflict: string; ignoreDuplicates: boolean }) => ({ abortSignal: async (signal: AbortSignal) => {
        assert.ok(signal instanceof AbortSignal); assert.deepEqual(config, { onConflict: 'id', ignoreDuplicates: true })
        events.push('insert'); writes.push(rows)
        if (options.race) stored.set(options.race.id, options.race)
        if (!options.writeFail) for (const row of rows) if (!stored.has(row.id)) stored.set(row.id, row)
        return { error: options.writeFail ? { code: 'DB' } : null }
      } }),
    }
  } }
  const identityModule = await compiled('../src/lib/nbaResearchIdentity.ts', {
    'server-only': {}, './supabase/admin': { createAdminClient: () => admin },
    './nbaPaintData': { getPaintRoster: async (requestedGame: PaintGame) => {
      assert.equal(requestedGame, game); events.push('roster')
      if (options.rosterFail) throw new Error('Roster incomplete')
      return options.roster ?? [player]
    } },
  })
  const ensure = identityModule.ensureNbaResearchPlayers as (game: PaintGame, rows: { player_id: number; team_id: number }[]) => Promise<void>
  return { events, requested, writes, stored, ensure }
}
const row = { player_id: player.id, team_id: home.id }

test('new scored active identity is inserted once from canonical roster, without compact board data', async () => {
  const h = await harness()
  await h.ensure(game, [row, row, row])
  assert.deepEqual(h.events, ['read', 'roster', 'insert'])
  assert.deepEqual(h.requested, [[player.id]])
  assert.equal(h.writes[0].length, 1)
  assert.equal(h.writes[0][0].payload, player)
  assert.equal(h.writes[0][0].payload.college, 'Gonzaga')
  assert.equal(h.writes[0][0].team_id, home.id)
  assert.ok(Number.isFinite(Date.parse(h.writes[0][0].fetched_at)))
  await h.ensure(game, [row])
  assert.deepEqual(h.events, ['read', 'roster', 'insert', 'read'])
})

test('known and unscored players trigger no canonical fetch or identity rewrite; concurrent insertion wins', async () => {
  const h = await harness({ known: [player.id] }), previous = h.stored.get(player.id)
  await h.ensure(game, [])
  assert.deepEqual(h.events, [])
  await h.ensure(game, [row])
  assert.deepEqual(h.events, ['read']); assert.equal(h.stored.get(player.id), previous)
  const raced: Identity = { id: player.id, team_id: away.id, payload: { ...player, team: away }, fetched_at: '2026-10-20T02:16:00Z' }
  const race = await harness({ race: raced })
  await race.ensure(game, [row])
  assert.equal(race.stored.get(player.id), raced)
})

test('missing, changed-team, duplicate and incomplete canonical identities fail before any insertion', async () => {
  for (const options of [
    { roster: [] }, { roster: [{ ...player, id: player.id + 1 }] },
    { roster: [{ ...player, team: away }] }, { roster: [player, player] },
    { roster: [{ ...player, first_name: '' }] }, { rosterFail: true }, { readFail: true },
  ]) {
    const h = await harness(options)
    await assert.rejects(h.ensure(game, [row]))
    assert.equal(h.writes.length, 0)
  }
  for (const rows of [[{ ...row, team_id: 99 }], [{ ...row, player_id: -1 }], [row, { ...row, team_id: away.id }]]) {
    const h = await harness(); await assert.rejects(h.ensure(game, rows))
    assert.deepEqual(h.events, [])
  }
  const failed = await harness({ writeFail: true })
  await assert.rejects(failed.ensure(game, [row]), /identities could not save/)
  assert.equal(failed.stored.size, 0)
})

test('normal scheduled research capture establishes missing identity before strict archive write; failure remains honest and releases lease', async () => {
  class Clock extends Date { static now() { return Date.parse('2026-10-20T02:15:00Z') } }
  for (const failure of ['none', 'identity', 'grade']) {
    const failed = failure !== 'none'
    const h = await harness({ writeFail: failure === 'identity' }), events = h.events
    let archived = 0
    const query = { eq: () => query, order: () => query, limit: async () => ({ data: [], error: null }), in: async () => ({ data: [], error: null }) }
    const admin = {
      from: (table: string) => ({ select: () => query, update: () => { assert.equal(table, 'nba_source_cache'); events.push('release'); return query } }),
      rpc: async (name: string, args?: { p_rows: { player_id: number; team_id: number }[] }) => {
        if (name === 'grade_nba_research_snapshots' && failure === 'grade') return { data: null, error: { message: 'fixture timeout' } }
        if (name === 'prune_nba_source_cache') events.push('prune')
        if (name === 'record_nba_research_batch') {
          assert.ok(h.stored.has(player.id), 'strict database identity must exist before archival')
          assert.equal(args?.p_rows.length, 1); archived++; events.push('archive')
        }
        return { data: name === 'claim_nba_source' ? true : 0, error: null }
      },
    }
    const route = await compiled('../src/app/api/cron/nba-research-snapshot/route.ts', {
      'node:crypto': await import('node:crypto'), 'next/server': { NextResponse: { json: Response.json } },
      '@/lib/cron-auth': { requireCronAuth: () => null }, '@/lib/pipelineHealth': { withPipelineHealth: (_name: string, run: unknown) => run },
      '@/lib/supabase/admin': { createAdminClient: () => admin }, '@/lib/nbaResearchIdentity': { ensureNbaResearchPlayers: h.ensure },
      '@/lib/nbaPaintData': { getPaintSchedule: async () => ({ games: [game] }), getPaintBoard: async () => ({ players: [{ ...player, logs: [{ id: 1, game: { date: '2026-04-01' } }] }], sampleSeason: 2025, statsComplete: true }) },
      '@/lib/nbaIntelligenceData': { getNbaDefenseContext: async () => ({ profiles: [], ready: false }) },
      '@/lib/nbaMarketSignalData': { getNbaMarketContext: async () => null },
      '@/lib/nbaMarketSignal': { nbaMarketSupportIdentity: () => null },
      '@/lib/nbaIntelligence': { nbaPosition: () => 'F', nbaGamePace: () => null, nbaSlipSurgeScore: () => ({ version: 'test', score: 55, games: 24 }) },
      '@/lib/nbaModel': { nbaValidatedEstimate: () => null }, '@/lib/nbaMovement': {},
      '@/lib/nbaSharedCache': { nbaSharedCache: async (_key: string, _ttl: number, _stale: number, load: () => Promise<unknown>) => ({ value: await load() }) },
      '@/lib/nbaPaint': { nbaToday: () => '2026-10-19', nbaPeriod: () => 0, nbaMarketLogs: (p: { logs: unknown[] }) => p.logs, nbaReference: () => null, PAINT_MARKETS: [{ key: 'points' }] },
    }, Clock as unknown as DateConstructor)
    const response = await (route.GET as (request: Request) => Promise<Response>)(new Request('https://test/api/cron/nba-research-snapshot'))
    assert.equal(response.status, failed ? 503 : 200)
    assert.equal(archived, failed ? 0 : 1)
    assert.deepEqual(events, failure === 'grade' ? ['prune', 'release'] : failure === 'identity' ? ['read', 'roster', 'insert', 'prune', 'release'] : ['read', 'roster', 'insert', 'archive', 'prune', 'release'])
    const body = await response.json()
    if (failure === 'grade') assert.match(body.reason, /outcomes could not update/)
    else {
      assert.equal(body.failed, failed ? 1 : 0)
      if (failed) assert.match(body.results[0].reason, /identities could not save/)
    }
  }
})
