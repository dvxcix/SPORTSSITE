import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as modes from '../src/lib/nbaOddsMode.ts'
import type { PaintGame } from '../src/lib/nbaPaint.ts'

const tip = Date.parse('2026-10-24T22:00:00Z')
const game: PaintGame = { id: 21717946, date: '2026-10-24', season: 2026, datetime: new Date(tip).toISOString(), status: 'Scheduled', status_state: 'scheduled', period: 0, home_team: { id: 4, abbreviation: 'CHA', full_name: 'Charlotte Hornets', name: 'Hornets' }, visitor_team: { id: 16, abbreviation: 'MIA', full_name: 'Miami Heat', name: 'Heat' }, home_team_score: 0, visitor_team_score: 0 }
type Row = { payload: unknown; observed_at: string; tipoff_at: string; source: string }
const stored = (value: unknown = { baseline: 4 }, observed = tip - 60000, source = 'capture'): Row => ({ payload: value, observed_at: new Date(observed).toISOString(), tipoff_at: new Date(tip).toISOString(), source })

// The RPC stub is a controllable boundary, not a simulation of PostgreSQL. Tests
// exercise application behavior when the database rejects a late writer, chooses
// another writer, fails, or returns an invalid observation.
async function harness() {
  let now = tip - 1000, canonicalTip = tip, reads = 0, writes = 0
  let row: Row | null = null, readFailure = false, writeFailure = false
  let rpc: ((args: Record<string, unknown>) => Row | null) | null = null
  let readRpc: (() => Row | null) | null = null
  const calls: Record<string, unknown>[] = []
  class Clock extends Date { constructor(value: string | number = now) { super(value) } static now() { return now } }
  const db = {
    from(table: string) {
      reads++; assert.equal(table, 'nba_pregame_research')
      const filters: Record<string, unknown> = {}
      const query = {
        select(value: string) { assert.equal(value, 'payload,observed_at,tipoff_at,source'); return query },
        eq(key: string, value: unknown) { filters[key] = value; return query },
        abortSignal(signal: AbortSignal) { assert.ok(signal instanceof AbortSignal); return query },
        async maybeSingle() {
          assert.equal(filters.game_id, game.id); assert.equal(filters.version, 1); assert.equal(typeof filters.resource, 'string')
          return { data: structuredClone(readRpc ? readRpc() : row), error: readFailure ? { message: 'private DB detail' } : null }
        },
      }
      return query
    },
    rpc(name: string, args: Record<string, unknown>) {
      if (name === 'read_nba_pregame_research') {
        reads++
        assert.equal(args.p_game_id, game.id); assert.equal(args.p_version, 1)
        assert.equal(typeof args.p_resource, 'string'); assert.equal(typeof args.p_tipoff, 'string')
        return { async abortSignal(signal: AbortSignal) {
          assert.ok(signal instanceof AbortSignal)
          return { data: structuredClone(readRpc ? readRpc() : row), error: readFailure ? { message: 'private DB detail' } : null }
        } }
      }
      writes++; assert.equal(name, 'capture_nba_pregame_research'); calls.push(args)
      return { async abortSignal(signal: AbortSignal) {
        assert.ok(signal instanceof AbortSignal)
        if (writeFailure) return { data: null, error: { message: 'private DB detail' } }
        if (rpc) return { data: structuredClone(rpc(args)), error: null }
        row = { payload: structuredClone(args.p_payload), observed_at: String(args.p_observed_at), tipoff_at: String(args.p_tipoff), source: 'capture' }
        return { data: structuredClone(row), error: null }
      } }
    },
  }
  const imports: Record<string, unknown> = {
    'server-only': {}, './supabase/admin': { createAdminClient: () => db },
    './nbaOddsClockData': { getNbaOddsGame: async (input: PaintGame) => ({ ...input, datetime: new Date(Math.min(Date.parse(input.datetime!), canonicalTip)).toISOString() }) },
    './nbaOddsMode': { ...modes, nbaPregameOpen: (input: PaintGame) => modes.nbaPregameOpen(input, now) },
  }
  const output = ts.transpileModule(await readFile(new URL('../src/lib/nbaPregameResearchData.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'Date', output)((name: string) => { assert.ok(name in imports, name); return imports[name] }, module, module.exports, Clock)
  return {
    api: module.exports as typeof import('../src/lib/nbaPregameResearchData.ts'), calls,
    setTime(value: number) { now = value }, setCanonicalTip(value: number) { canonicalTip = value },
    setRow(value: Row | null) { row = structuredClone(value) },
    setReadFailure(value = true) { readFailure = value }, setWriteFailure(value = true) { writeFailure = value },
    setRpc(value: (args: Record<string, unknown>) => Row | null) { rpc = value },
    setReadRpc(value: () => Row | null) { readRpc = value },
    metrics: () => ({ reads, writes }),
  }
}

test('closed games return the existing archive without running any current loader', async () => {
  const h = await harness(); h.setTime(tip); h.setRow(stored(undefined, tip - 60000, 'recovered-cache'))
  const result = await h.api.nbaPregameResearch(game, 'board:v1', async () => { throw Error('Current loader must not run') })
  assert.deepEqual(result, { value: { baseline: 4 }, observedAt: new Date(tip - 60000).toISOString(), source: 'recovered-cache', frozen: true })
  assert.equal(h.metrics().writes, 0)
})

test('closed missing archive gives the typed unavailable error and no write', async () => {
  const h = await harness(); h.setTime(tip)
  await assert.rejects(h.api.nbaPregameResearch(game, 'board:v1', async () => { throw Error('Unexpected loader') }), h.api.NbaPregameResearchUnavailable)
  assert.equal(h.metrics().writes, 0)
})

test('in-progress status closes research even before the scheduled clock', async () => {
  const h = await harness(); h.setRow(stored())
  const result = await h.api.nbaPregameResearch({ ...game, status_state: 'in_progress', period: 1 }, 'board:v1', async () => { throw Error('Unexpected loader') })
  assert.equal(result.frozen, true)
  assert.equal(h.metrics().writes, 0)
})

test('open capture saves original observation and returns the database-selected winner', async () => {
  const h = await harness(), winner = stored({ baseline: 7 }, tip - 2000)
  h.setRpc(() => winner)
  const result = await h.api.nbaPregameResearch(game, 'board:v1', async () => ({ value: { baseline: 4 }, observedAt: new Date(tip - 60000).toISOString() }))
  assert.deepEqual(result.value, winner.payload)
  assert.equal(result.observedAt, winner.observed_at)
  assert.equal(result.frozen, false)
  assert.deepEqual(h.calls[0], { p_game_id: game.id, p_resource: 'board:v1', p_version: 1, p_tipoff: game.datetime, p_observed_at: new Date(tip - 60000).toISOString(), p_payload: { baseline: 4 } })
})

test('a loader crossing tip returns only an archive that already exists', async () => {
  for (const exists of [false, true]) {
    const h = await harness(); if (exists) h.setRow(stored())
    const result = h.api.nbaPregameResearch(game, 'board:v1', async () => { h.setTime(tip + 1); return { value: { baseline: 999 }, observedAt: new Date(tip - 2000).toISOString() } })
    if (exists) assert.deepEqual((await result).value, { baseline: 4 })
    else await assert.rejects(result, h.api.NbaPregameResearchUnavailable)
    assert.equal(h.metrics().writes, 0)
  }
})

test('database clock rejects a writer after lock wait even if application clock is still pretip', async () => {
  for (const exists of [false, true]) {
    const h = await harness(), authoritative = exists ? stored({ baseline: 7 }) : null
    h.setRow(authoritative)
    h.setRpc(() => authoritative) // DB wall clock is at/after tip; reject caller payload.
    const result = h.api.nbaPregameResearch(game, 'board:v1', async () => ({ value: { baseline: 999 }, observedAt: new Date(tip - 2000).toISOString() }))
    if (exists) assert.deepEqual((await result).value, { baseline: 7 })
    else await assert.rejects(result, h.api.NbaPregameResearchUnavailable)
    assert.equal(h.metrics().writes, 1)
  }
})

test('provider failure returns prior research, or propagates failure when no archive exists', async () => {
  for (const exists of [false, true]) {
    const h = await harness(); if (exists) h.setRow(stored())
    const result = h.api.nbaPregameResearch(game, 'board:v1', async () => { throw Error('Provider unavailable') })
    if (exists) assert.deepEqual((await result).value, { baseline: 4 })
    else await assert.rejects(result, /Provider unavailable/)
    assert.equal(h.metrics().writes, 0)
  }
})

test('write failure cannot return unarchived freshly loaded values', async () => {
  for (const exists of [false, true]) {
    const h = await harness(); h.setWriteFailure(); if (exists) h.setRow(stored())
    const result = h.api.nbaPregameResearch(game, 'board:v1', async () => ({ value: { baseline: 999 }, observedAt: new Date(tip - 2000).toISOString() }))
    if (exists) assert.deepEqual((await result).value, { baseline: 4 })
    else await assert.rejects(result, /Pregame research could not be archived/)
  }
})

test('future, invalid and exact-tip observations cannot trigger a capture RPC', async () => {
  for (const observedAt of ['invalid', new Date(tip - 500).toISOString(), new Date(tip).toISOString()]) {
    const h = await harness(); h.setRow(stored())
    const result = await h.api.saveNbaPregameResearch(game, 'board:v1', { value: { baseline: 999 }, observedAt })
    assert.deepEqual(result?.value, { baseline: 4 })
    assert.equal(h.metrics().writes, 0)
  }
})

test('invalid archived observations and provenance fail closed', async () => {
  const invalid = [
    { ...stored(), observed_at: 'invalid' }, { ...stored(), tipoff_at: 'invalid' },
    { ...stored(), observed_at: new Date(tip).toISOString() }, { ...stored(), tipoff_at: new Date(tip - 120000).toISOString() },
    { ...stored(), observed_at: new Date(tip - 500).toISOString() }, { ...stored(), payload: null }, { ...stored(), source: 'unknown' },
  ]
  for (const row of invalid) {
    const h = await harness(); h.setRow(row)
    assert.equal(await h.api.readNbaPregameResearch(game, 'board:v1'), null)
  }
})

test('corrected earlier cutoff cannot be reopened by a later provider schedule', async () => {
  const h = await harness(); h.setTime(tip + 1000); h.setRow(stored())
  const result = await h.api.nbaPregameResearch({ ...game, datetime: new Date(tip + 3600000).toISOString() }, 'board:v1', async () => { throw Error('Unexpected loader') })
  assert.equal(result.frozen, true)
  assert.equal(h.metrics().writes, 0)
})

test('an earlier canonical cutoff invalidates an observation recorded after that cutoff', async () => {
  const h = await harness(); h.setCanonicalTip(tip - 120000); h.setRow(stored())
  await assert.rejects(h.api.nbaPregameResearch(game, 'board:v1', async () => { throw Error('Unexpected loader') }), h.api.NbaPregameResearchUnavailable)
})

test('invalid resource identifiers never reach the database', async () => {
  for (const resource of ['', 'board:v1/unsafe', 'x'.repeat(161)]) {
    const h = await harness()
    await assert.rejects(h.api.readNbaPregameResearch(game, resource), /Invalid NBA research resource/)
    await assert.rejects(h.api.saveNbaPregameResearch(game, resource, { value: {}, observedAt: new Date(tip - 60000).toISOString() }), /Invalid NBA research resource/)
    assert.deepEqual(h.metrics(), { reads: 0, writes: 0 })
  }
})

test('read failure surfaces a sanitized error without calling current providers', async () => {
  const h = await harness(); h.setTime(tip); h.setReadFailure()
  await assert.rejects(h.api.nbaPregameResearch(game, 'board:v1', async () => { throw Error('Unexpected loader') }), /^Error: Pregame research archive unavailable$/)
  assert.equal(h.metrics().writes, 0)
})

test('caller mutation cannot alter a shared archive from either a database read or memory hit', async () => {
  const h = await harness(); h.setRow(stored({ players: [{ average: 4 }] }))
  const first = await h.api.readNbaPregameResearch<{ players: { average: number }[] }>(game, 'board:v1')
  first!.value.players[0].average = 999
  const second = await h.api.readNbaPregameResearch<{ players: { average: number }[] }>(game, 'board:v1')
  assert.equal(second!.value.players[0].average, 4)
  second!.value.players.push({ average: 10 })
  const third = await h.api.readNbaPregameResearch<{ players: { average: number }[] }>(game, 'board:v1')
  assert.deepEqual(third!.value, { players: [{ average: 4 }] })
  assert.equal(h.metrics().reads, 1)
})

test('open research reuses one locked read for at most ten seconds without restamping it', async () => {
  const h = await harness(); h.setTime(tip - 60_000); h.setRow(stored({ baseline: 4 }, tip - 120_000))
  const original = await h.api.readNbaPregameResearch<{ baseline: number }>(game, 'board:v1')
  h.setRow(stored({ baseline: 7 }, tip - 56_000)); h.setTime(tip - 54_000)
  const retained = await h.api.readNbaPregameResearch<{ baseline: number }>(game, 'board:v1')
  assert.equal(h.metrics().reads, 1)
  assert.deepEqual(retained, original)
  h.setTime(tip - 50_000)
  const refreshed = await h.api.readNbaPregameResearch<{ baseline: number }>(game, 'board:v1')
  assert.equal(h.metrics().reads, 2)
  assert.equal(refreshed!.value.baseline, 7)
  assert.equal(refreshed!.observedAt, new Date(tip - 56_000).toISOString())
})

test('extended open cache expires at the original tip and returns the locked final winner', async () => {
  const h = await harness(); h.setTime(tip - 9000); h.setRow(stored({ baseline: 4 }))
  await h.api.readNbaPregameResearch(game, 'board:v1')
  h.setRow(stored({ baseline: 7 }, tip - 1000)); h.setTime(tip - 1000)
  assert.equal((await h.api.readNbaPregameResearch<{ baseline: number }>(game, 'board:v1'))!.value.baseline, 4)
  h.setTime(tip)
  const final = await h.api.readNbaPregameResearch<{ baseline: number }>(game, 'board:v1')
  assert.equal(final!.value.baseline, 7); assert.equal(final!.frozen, true)
  assert.equal(final!.observedAt, new Date(tip - 1000).toISOString()); assert.equal(h.metrics().reads, 2)
})

test('a newly known early tip bypasses the open memory entry and reads the final winner', async () => {
  const h = await harness(); h.setTime(tip - 60_000); h.setRow(stored({ baseline: 4 }, tip - 120_000))
  await h.api.readNbaPregameResearch(game, 'board:v1')
  h.setCanonicalTip(tip - 55_000); h.setRow(stored({ baseline: 7 }, tip - 56_000)); h.setTime(tip - 54_000)
  const final = await h.api.readNbaPregameResearch<{ baseline: number }>(game, 'board:v1')
  assert.equal(final!.value.baseline, 7); assert.equal(final!.frozen, true)
  assert.equal(final!.observedAt, new Date(tip - 56_000).toISOString()); assert.equal(h.metrics().reads, 2)
})

test('same-observation writes coalesce and return independent values to each caller', async () => {
  const h = await harness(), entry = { value: { players: [{ average: 4 }] }, observedAt: new Date(tip - 2000).toISOString() }
  const [first, second] = await Promise.all([h.api.saveNbaPregameResearch(game, 'board:v1', entry), h.api.saveNbaPregameResearch(game, 'board:v1', entry)])
  assert.equal(h.metrics().writes, 1)
  first!.value.players[0].average = 999
  assert.equal(second!.value.players[0].average, 4)
  const read = await h.api.readNbaPregameResearch<typeof entry.value>(game, 'board:v1')
  assert.equal(read!.value.players[0].average, 4)
})

test('concurrent cold archive reads coalesce and return independent values', async () => {
  const h = await harness(); h.setTime(tip); h.setRow(stored({ baseline: 4 }))
  const values = await Promise.all(Array.from({ length: 30 }, () => h.api.readNbaPregameResearch<{ baseline: number }>(game, 'board:v1')))
  assert.equal(h.metrics().reads, 1)
  values[0]!.value.baseline = 999
  assert.ok(values.slice(1).every(value => value!.value.baseline === 4))
})

test('cached rows still honor a newly discovered earlier canonical cutoff', async () => {
  const h = await harness(); h.setRow(stored())
  assert.ok(await h.api.readNbaPregameResearch(game, 'board:v1'))
  h.setCanonicalTip(tip - 120000)
  assert.equal(await h.api.readNbaPregameResearch(game, 'board:v1'), null)
  assert.equal(h.metrics().reads, 2, 'a newly closed cutoff resolves the durable winner instead of using a pretip memory entry')
})

test('missing archives are not negatively cached across a concurrent successful capture', async () => {
  const h = await harness()
  assert.equal(await h.api.readNbaPregameResearch(game, 'board:v1'), null)
  h.setRow(stored())
  assert.ok(await h.api.readNbaPregameResearch(game, 'board:v1'))
  assert.equal(h.metrics().reads, 2)
})

test('the first posttip read resolves the final database winner instead of carrying pretip memory across tip', async () => {
  const h = await harness(); h.setRow(stored({ baseline: 4 }))
  assert.deepEqual((await h.api.readNbaPregameResearch(game, 'board:v1'))?.value, { baseline: 4 })
  // Another serverless process archives a newer observation before tip.
  h.setRow(stored({ baseline: 7 }, tip - 500))
  h.setTime(tip)
  const frozen = await h.api.readNbaPregameResearch(game, 'board:v1')
  assert.deepEqual(frozen?.value, { baseline: 7 })
  assert.equal(frozen?.frozen, true)
  assert.equal(h.metrics().reads, 2)
})

test('a database read begun pretip cannot cache its delayed older response as the frozen winner', async () => {
  const h = await harness(), old = stored({ baseline: 4 }), winner = stored({ baseline: 7 }, tip - 500)
  let first = true
  h.setReadRpc(() => {
    if (!first) return winner
    first = false
    h.setTime(tip)
    return old
  })
  const result = await h.api.readNbaPregameResearch(game, 'board:v1')
  assert.deepEqual(result?.value, winner.payload)
  assert.equal(result?.frozen, true)
  assert.deepEqual((await h.api.readNbaPregameResearch(game, 'board:v1'))?.value, winner.payload)
  assert.equal(h.metrics().reads, 2, 'crossed read resolves the winner once under the closed-game lock, then caches it')
})

test('a capture RPC begun pretip cannot cache its delayed older response as the frozen winner', async () => {
  const h = await harness(), old = stored({ baseline: 4 }, tip - 2000), winner = stored({ baseline: 7 }, tip - 500)
  h.setRpc(() => { h.setTime(tip); h.setRow(winner); return old })
  const result = await h.api.saveNbaPregameResearch(game, 'board:v1', { value: old.payload, observedAt: old.observed_at })
  assert.deepEqual(result?.value, winner.payload)
  assert.equal(result?.frozen, true)
  assert.deepEqual((await h.api.readNbaPregameResearch(game, 'board:v1'))?.value, winner.payload)
  assert.equal(h.metrics().writes, 1)
  assert.equal(h.metrics().reads, 1, 'after the crossed write only a new locked read may define the frozen result')
})
