import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

type State = { key: string; endpoint: string; season: number | null; complete: boolean; updated_at: string; cursor: number | null; pages: number; rows_seen: number; last_error: string | null }
const now = '2026-10-19T14:00:00Z'
const recent = (kind: string, end = '2026-10-10', complete = true): State => ({
  key: `${kind}:recent:2026`, endpoint: `${kind === 'advanced' ? '/nba/v2/stats/advanced' : kind === 'games' ? '/v1/games' : '/v1/stats'}?seasons[]=2026&start_date=2026-10-07&end_date=${end}${kind === 'period1' ? '&period=1' : ''}&per_page=100`,
  season: 2026, complete, updated_at: '2026-10-10T12:00:00Z', cursor: complete ? null : 400, pages: 4, rows_seen: 400, last_error: null,
})
async function fixture(initial: State[], clock = now) {
  const states = new Map(initial.map(row => [row.key, { ...row }]))
  const writes: { key: string; changes: Partial<State> }[] = []
  const admin = { from(table: string) {
    assert.equal(table, 'nba_ingestion_state')
    let changes: Partial<State> | null = null
    const filters: [keyof State, unknown][] = []
    const query = {
      async upsert(jobs: State[], options: unknown) {
        assert.deepEqual(options, { onConflict: 'key', ignoreDuplicates: true })
        for (const job of jobs) if (!states.has(job.key)) states.set(job.key, { ...job, complete: !job.key.includes(':tail:'), updated_at: clock, cursor: null, pages: 1, rows_seen: 0, last_error: null })
        return { error: null }
      },
      select() { return query },
      async in(_field: string, keys: string[]) { return { data: keys.flatMap(key => states.has(key) ? [{ ...states.get(key)! }] : []), error: null } },
      update(value: Partial<State>) { changes = value; return query },
      eq(field: keyof State, value: unknown) { filters.push([field, value]); return query },
      then(resolve: (result: { error: null }) => unknown) {
        for (const row of states.values()) if (filters.every(([field, value]) => row[field] === value)) {
          writes.push({ key: row.key, changes: changes! }); Object.assign(row, changes)
        }
        return Promise.resolve(resolve({ error: null }))
      },
    }
    return query
  } }
  const source = await readFile(new URL('../src/lib/nbaIngestion.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const imports: Record<string, unknown> = { 'server-only': {}, './balldontlie': { bdlHeaders: {} }, './supabase/admin': { createAdminClient: () => admin }, './nbaPaint': { nbaToday: () => clock.slice(0, 10) } }
  const target = { exports: {} as { seedNbaIngestion(): Promise<string[]> } }
  class Clock extends Date { static now() { return Date.parse(clock) } }
  new Function('require', 'exports', 'module', 'Date', outputText)((name: string) => { assert.ok(name in imports, name); return imports[name] }, target.exports, target, Clock)
  return { states, writes, seed: target.exports.seedNbaIngestion }
}

test('rolling NBA collectors cover an outage gap before returning to the normal correction window', async () => {
  const f = await fixture([recent('stats'), recent('period1'), recent('advanced'), recent('games', '2026-10-24')])
  await f.seed()
  assert.equal(f.writes.length, 4)
  for (const row of f.states.values()) if (row.key.includes(':recent:')) {
    const params = new URLSearchParams(row.endpoint.split('?')[1])
    assert.equal(params.get('start_date'), '2026-10-07', row.key)
    assert.equal(params.get('end_date'), row.key.startsWith('games:') ? '2026-11-02' : '2026-10-19')
    assert.equal(row.cursor, null); assert.equal(row.complete, false)
    if (row.key.startsWith('period1:')) assert.equal(params.get('period'), '1')
    row.complete = true; row.updated_at = '2026-10-19T12:00:00Z'
  }
  await f.seed()
  for (const row of f.states.values()) if (row.key.includes(':recent:')) assert.equal(new URLSearchParams(row.endpoint.split('?')[1]).get('start_date'), '2026-10-16', row.key)
})

test('unfinished NBA imports retain exact date range and cursor; fresh sources and completed history stay untouched', async () => {
  const unfinished = recent('stats', '2026-10-10', false)
  const fresh = { ...recent('period1'), updated_at: '2026-10-19T13:55:00Z' }
  const history = { ...recent('advanced'), key: 'advanced:2025', season: 2025 }
  const f = await fixture([unfinished, fresh, history])
  await f.seed()
  assert.deepEqual(f.states.get(unfinished.key), unfinished)
  assert.deepEqual(f.states.get(fresh.key), fresh)
  assert.deepEqual(f.states.get(history.key), history)
  assert.equal(f.writes.length, 0)
})

test('NBA roster and team refreshes retain their own cadence and never gain date-range filters', async () => {
  const teams = { ...recent('stats'), key: 'teams', endpoint: '/v1/teams?per_page=100', season: null, updated_at: '2026-10-19T00:00:00Z' }
  const players = { ...teams, key: 'players', endpoint: '/v1/players/active?per_page=100', updated_at: '2026-10-19T07:00:00Z' }
  const f = await fixture([teams, players]); await f.seed()
  assert.deepEqual(f.writes.map(write => write.key), ['players'])
  assert.equal(f.states.get('players')!.endpoint, players.endpoint)
  assert.deepEqual(f.states.get('teams'), teams)
})

function priorRecent(kind: string, end = kind === 'games' ? '2026-04-15' : '2026-04-01', complete = true): State {
  const row = recent(kind, end, complete)
  return { ...row, key: `${kind}:recent:2025`, season: 2025, endpoint: row.endpoint.replace('seasons[]=2026', 'seasons[]=2025'), updated_at: '2026-04-01T12:00:00Z' }
}

test('NBA rollover catches the previous regular-season tail once, with the same bounded end when resuming next January', async () => {
  for (const clock of ['2026-07-02T14:00:00Z', '2027-01-10T14:00:00Z']) {
    const prior = ['games', 'stats', 'period1', 'advanced'].map(kind => priorRecent(kind))
    const historical = { ...prior[1], key: 'stats:2025', complete: true }
    const f = await fixture([...prior, historical], clock)
    const keys = await f.seed()
    const tails = [...f.states.values()].filter(row => row.key.includes(':tail:'))
    assert.equal(tails.length, 4)
    for (const row of tails) {
      const params = new URLSearchParams(row.endpoint.split('?')[1])
      assert.equal(row.season, 2025); assert.equal(params.get('seasons[]'), '2025')
      assert.equal(params.get('start_date'), '2026-03-29'); assert.equal(params.get('end_date'), '2026-06-30')
      assert.equal(row.complete, false)
      assert.ok(keys.indexOf(row.key) < keys.indexOf('stats:2025'), 'bounded tail should not queue behind full historical imports')
      if (row.key.startsWith('period1:')) assert.equal(params.get('period'), '1')
      row.cursor = 800; row.pages = 8; row.rows_seen = 800
    }
    const pending = tails.map(row => ({ ...row }))
    await f.seed()
    assert.deepEqual(tails, pending, 'do not restart an unfinished tail or lose its cursor')
    for (const row of tails) { row.complete = true; row.cursor = null }
    const completed = tails.map(row => ({ ...row }))
    await f.seed()
    assert.deepEqual(tails, completed, 'a completed tail is not a rolling scan')
    for (const row of prior) assert.deepEqual(f.states.get(row.key), row)
    assert.deepEqual(f.states.get(historical.key), historical)
  }
})

test('NBA rollover lets an unfinished prior scan finish before creating its remaining tail', async () => {
  const prior = priorRecent('stats', '2026-04-01', false), f = await fixture([prior], '2026-07-02T14:00:00Z')
  await f.seed()
  assert.deepEqual(f.states.get(prior.key), prior)
  assert.equal(f.states.has('stats:tail:2025'), false)
  f.states.get(prior.key)!.complete = true; f.states.get(prior.key)!.cursor = null
  await f.seed()
  assert.equal(new URLSearchParams(f.states.get('stats:tail:2025')!.endpoint.split('?')[1]).get('end_date'), '2026-06-30')
})

test('NBA rollover discounts games forward dates and does not repeat already completed season coverage', async () => {
  const futureSchedule = priorRecent('games', '2026-07-09')
  const f = await fixture([futureSchedule, priorRecent('stats', '2026-06-30'), priorRecent('period1', '2026-07-01')], '2026-07-02T14:00:00Z')
  await f.seed()
  const tail = f.states.get('games:tail:2025')!
  assert.equal(new URLSearchParams(tail.endpoint.split('?')[1]).get('start_date'), '2026-06-22')
  assert.equal(new URLSearchParams(tail.endpoint.split('?')[1]).get('end_date'), '2026-06-30')
  assert.equal(f.states.has('stats:tail:2025'), false); assert.equal(f.states.has('period1:tail:2025'), false)
  const completeGames = await fixture([priorRecent('games', '2026-07-14')], '2026-07-15T14:00:00Z')
  await completeGames.seed()
  assert.equal(completeGames.states.has('games:tail:2025'), false)
})
