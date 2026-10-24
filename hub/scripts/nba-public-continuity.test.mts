import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as history from '../src/lib/nbaPublicHistory.ts'
import { nbaPublicObservation, type NbaPublicPayload } from '../src/lib/nbaPublicObservation.ts'
import { NBA_PUBLIC_VERSION, type NbaPublicMarketState, type NbaPublicRow } from '../src/lib/nbaPublic.ts'
import type { PaintGame, PaintRoster } from '../src/lib/nbaPaint.ts'

const now = Date.parse('2026-10-24T10:00:00Z'), tip = now + 3600000
const at = (seconds: number) => new Date(now + seconds * 1000).toISOString()
const team = { id: 1, abbreviation: 'BOS', full_name: 'Boston Celtics', name: 'Celtics', city: 'Boston', conference: 'East', division: 'Atlantic' }
const game: PaintGame = { id: 123, date: '2026-10-24', season: 2026, status: 'Scheduled', status_state: 'scheduled', datetime: new Date(tip).toISOString(), period: 0, home_team: team, visitor_team: { ...team, id: 2 }, home_team_score: 0, visitor_team_score: 0 }
const roster: PaintRoster[] = [{ id: 1, first_name: 'Player', last_name: 'One', position: 'G', team }, { id: 2, first_name: 'Player', last_name: 'Two', position: 'C', team }]
const state = (label: string, status: NbaPublicMarketState['status'], rows: number, seconds = -1): NbaPublicMarketState => ({ label, value: label.toLowerCase(), status, rows, observedAt: at(seconds) })
const payload = (props: NbaPublicPayload['props'], marketStates: NbaPublicMarketState[], complete = true): NbaPublicPayload => ({ url: 'https://app.pikkit.com/event/verified123', capturedAt: at(0), props, marketStates, complete })
const frame = (seconds: number, rows: NbaPublicRow[], extra: Record<string, unknown> = {}): history.NbaPublicStoredFrame => ({ captured_at: at(seconds), snapshot: { gameId: 123, capturedAt: at(seconds), sourceUrl: 'private-source', unmatched: 0, normalizationVersion: 'nba-public-v2', rows, markets: rows.map(row => row.market), ...extra } })

test('verified zero headers are saved as observations and unknown first baselines remain null', () => {
  const snapshot = nbaPublicObservation(game, payload({ Points: { 'Player One Points': 0 }, Assists: { 'Player Two Assists': 0 } }, [state('Points', 'captured', 1), state('Assists', 'captured', 1)]), roster, now)
  assert.equal(snapshot.complete, true)
  assert.deepEqual(snapshot.rows.map(row => row.picks), [0, 0])
  const view = history.nbaPublicHistory([frame(0, snapshot.rows, snapshot)], 123, 'pregame', tip, now)[0]
  assert.equal(view.snapshot.rows.every(row => row.previous === null && row.previousAt === null && row.capturedAt === at(-1)), true)
})

test('one failed category and unsupported source label do not discard verified siblings or private raw evidence', () => {
  const snapshot = nbaPublicObservation(game, payload({ Points: { 'Player One Points': 10 }, Rebounds: { 'Player Two Rebounds': 0 }, 'Novel statistic': { 'Player One Novel statistic': 7 } }, [state('Points', 'captured', 1), state('Rebounds', 'unavailable', 1), state('Novel statistic', 'captured', 1), state('Assists', 'deadline', 0)], false), roster, now)
  assert.equal(snapshot.complete, false)
  assert.deepEqual(snapshot.rows.map(row => [row.market, row.picks]), [['points', 10], ['rebounds', 0]])
  assert.equal(snapshot.rawCategories.find(category => category.label === 'Novel statistic')?.props['Player One Novel statistic'], 7)
  assert.equal(snapshot.coverage.unsupported, 1)
  const view = history.nbaPublicHistory([frame(0, snapshot.rows, snapshot)], 123, 'pregame', tip, now)
  assert.doesNotMatch(JSON.stringify(view), /sourceUrl|private-source|rawCategories|Novel statistic|Player One/)
})

test('raw-only, verified empty and invalid category evidence remain honest without invented zero players', () => {
  const empty = nbaPublicObservation(game, payload({}, [state('Points', 'empty', 0)]), roster, now)
  assert.equal(empty.complete, true); assert.deepEqual(empty.rows, [])
  const unresolved = nbaPublicObservation(game, payload({}, [state('Points', 'unavailable', 0)], false), roster, now)
  assert.equal(unresolved.complete, false); assert.deepEqual(unresolved.rows, [])
  const malformed = nbaPublicObservation(game, payload({ Points: { 'Player One Points': -1 }, Assists: { 'Player Two Assists': 8 } }, [state('Points', 'captured', 1), state('Assists', 'captured', 1)]), roster, now)
  assert.equal(malformed.complete, false); assert.deepEqual(malformed.rows.map(row => row.market), ['assists'])
  const malformedState = nbaPublicObservation(game, payload({ Assists: { 'Player Two Assists': 8 } }, [null as unknown as NbaPublicMarketState, state('Assists', 'captured', 1)]), roster, now)
  assert.equal(malformedState.complete, false); assert.deepEqual(malformedState.rows.map(row => row.market), ['assists'])
})

test('per-row baseline survives intervening partial captures and unchanged observation yields zero movement', () => {
  const rows = history.nbaPublicHistory([
    frame(-30, [{ playerId: 1, market: 'points', picks: 10 }, { playerId: 1, market: 'assists', picks: 5 }]),
    frame(-20, [{ playerId: 1, market: 'points', picks: 13 }]),
    frame(-10, [{ playerId: 1, market: 'assists', picks: 5 }]),
  ], 123, 'pregame', tip, now)[0].snapshot.rows
  assert.deepEqual(rows.find(row => row.market === 'points'), { playerId: 1, market: 'points', picks: 13, capturedAt: at(-20), previous: 10, previousAt: at(-30), normalizationVersion: 'nba-public-v2' })
  assert.deepEqual(rows.find(row => row.market === 'assists'), { playerId: 1, market: 'assists', picks: 5, capturedAt: at(-10), previous: 5, previousAt: at(-30), normalizationVersion: 'nba-public-v2' })
})

test('composite carry-forward preserves baseline, old timestamp and parser version across unrelated frames', () => {
  const prior: NbaPublicRow = { playerId: 1, market: 'points', picks: 13, capturedAt: at(-30), previous: 10, previousAt: at(-40), normalizationVersion: 'nba-public-v2' }
  const result = history.nbaPublicHistory([frame(-1, [prior, { playerId: 1, market: 'assists', picks: 0, capturedAt: at(-1), previous: null, previousAt: null, normalizationVersion: NBA_PUBLIC_VERSION }], { continuityVersion: 1, normalizationVersion: NBA_PUBLIC_VERSION, complete: false })], 123, 'pregame', tip, now)[0]
  assert.deepEqual(result.snapshot.rows.find(row => row.market === 'points'), prior)
  assert.equal(result.snapshot.complete, false)
})

test('phase and as-of checks apply to individual rows and their baselines', () => {
  const phaseTip = now - 10_000
  const snapshot = frame(0, [
    { playerId: 1, market: 'points', picks: 20, capturedAt: at(-20), previous: 10, previousAt: at(-30) },
    { playerId: 1, market: 'assists', picks: 5, capturedAt: at(-1), previous: 3, previousAt: at(-20) },
    { playerId: 2, market: 'points', picks: 99, capturedAt: at(1) },
  ], { continuityVersion: 1 })
  const live = history.nbaPublicHistory([snapshot], 123, 'live', phaseTip, now)[0].snapshot.rows
  assert.equal(live.length, 1); assert.equal(live[0].market, 'assists'); assert.equal(live[0].previous, null)
  assert.deepEqual(history.nbaPublicHistory([snapshot], 123, 'pregame', phaseTip, now), [])
  assert.deepEqual(history.nbaPublicHistory([snapshot], 999, 'live', phaseTip, now), [])
  assert.deepEqual(history.nbaPublicHistory([snapshot], 123, 'live', phaseTip, now - 1), [])
})

test('invalid capture identity, future/beyond-tip observations and absent verification metadata fail closed', () => {
  const valid = payload({ Points: { 'Player One Points': 0 } }, [state('Points', 'captured', 1)])
  assert.throws(() => nbaPublicObservation(game, { ...valid, url: 'https://wrong.test/event/x' }, roster, now))
  assert.throws(() => nbaPublicObservation(game, { ...valid, marketStates: undefined }, roster, now))
  assert.throws(() => nbaPublicObservation(game, valid, roster, tip))
  const invalid = nbaPublicObservation(game, { ...valid, marketStates: [state('Points', 'captured', 1, 1)] }, roster, now)
  assert.equal(invalid.complete, false); assert.deepEqual(invalid.rows, [])
})

test('reader uses one composite or bounded64 legacy frames, with separate phase cache keys and no raw source leakage', async () => {
  const source = await readFile(new URL('../src/lib/nbaPublicData.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  for (const composite of [false, true]) {
    const limits: number[] = [], keys: string[] = []
    const readerNow = Date.now(), observed = new Date(readerNow - 1000).toISOString()
    const readerGame = { ...game, datetime: new Date(readerNow + 3600000).toISOString() }
    const snapshot = { captured_at: observed, snapshot: { ...frame(-1, [{ playerId: 1, market: 'points', picks: 0 }]).snapshot, capturedAt: observed, continuityVersion: composite ? 1 : undefined } }
    const query = { select() { return this }, eq() { return this }, lte() { return this }, gte() { return this }, order() { return this }, limit(n: number) { limits.push(n); return this }, abortSignal: async () => ({ data: [snapshot], error: null }) }
    const mocks: Record<string, unknown> = { 'server-only': {}, './nbaPublicHistory': history, './nbaOddsMode': await import('../src/lib/nbaOddsMode.ts'), './supabase/admin': { createAdminClient: () => ({ from: () => query }) }, './nbaPaintData': { getPaintGame: async () => readerGame }, './nbaOddsClockData': { getNbaOddsGame: async () => readerGame }, './nbaSharedCache': { nbaSharedCache: async (key: string, _ttl: number, _stale: number, load: () => Promise<unknown>) => { keys.push(key); return { value: await load() } } } }
    const fixture = { exports: {} as { getNbaPublicCaptures: (id: number) => Promise<history.NbaPublicView[]> } }
    new Function('require', 'module', 'exports', compiled)((id: string) => { assert.ok(id in mocks); return mocks[id] }, fixture, fixture.exports)
    const result = await fixture.exports.getNbaPublicCaptures(123)
    assert.deepEqual(limits, composite ? [1] : [1, 64])
    assert.match(keys[0], /public-captures:v3:pregame:123/)
    assert.equal(result[0].snapshot.rows[0].picks, 0)
    assert.equal(result[0].snapshot.rows[0].capturedAt, observed)
    assert.doesNotMatch(JSON.stringify(result), /private-source|sourceUrl/)
  }
})

test('importer requires archive acknowledgement, reports partial rows honestly and rechecks canonical tipoff', async () => {
  const source = await readFile(new URL('../src/lib/nbaPublicServer.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const clock = Date.now(), observedAt = new Date(clock - 1000).toISOString()
  const canonical = { ...game, datetime: new Date(clock + 3600000).toISOString() }
  const incoming: NbaPublicPayload = { url: 'https://app.pikkit.com/event/verified123', capturedAt: observedAt, complete: false, props: { Points: { 'Player One Points': 0 } }, marketStates: [{ label: 'Points', value: 'points', status: 'unavailable', rows: 1, observedAt }] }
  let acknowledgement: unknown = false, expired = false, rosterReads = 0
  const writes: { name: string; args: Record<string, unknown> }[] = []
  const mocks: Record<string, unknown> = {
    'server-only': {}, 'node:crypto': await import('node:crypto'), './nbaOddsMode': await import('../src/lib/nbaOddsMode.ts'),
    './nbaPublicObservation': { nbaPublicObservation },
    './nbaOddsClockData': { getNbaOddsGame: async () => ({ ...canonical, ...(expired ? { datetime: new Date(clock - 1).toISOString() } : {}) }) },
    './nbaPaintData': { getPaintRoster: async () => { rosterReads++; return roster } },
    './supabase/admin': { createAdminClient: () => ({ rpc: async (name: string, args: Record<string, unknown>) => { writes.push({ name, args }); return { data: acknowledgement, error: null } } }) },
  }
  const fixture = { exports: {} as { importNbaPublic: (game: PaintGame, payload: NbaPublicPayload) => Promise<{ changed: boolean; complete: boolean; available: boolean; rows: number }> } }
  new Function('require', 'module', 'exports', compiled)((id: string) => { assert.ok(id in mocks); return mocks[id] }, fixture, fixture.exports)
  const result = await fixture.exports.importNbaPublic(game, incoming)
  assert.equal(result.changed, false); assert.equal(result.complete, false); assert.equal(result.available, true); assert.equal(result.rows, 1)
  assert.equal(writes[0].name, 'record_nba_public_capture')
  assert.equal((writes[0].args.p_snapshot as { rows: NbaPublicRow[] }).rows[0].picks, 0)
  acknowledgement = null
  await assert.rejects(fixture.exports.importNbaPublic(game, incoming), /could not save/)
  expired = true
  const readsBefore = rosterReads, writesBefore = writes.length
  await assert.rejects(fixture.exports.importNbaPublic(game, incoming), /tipoff/)
  assert.equal(rosterReads, readsBefore); assert.equal(writes.length, writesBefore)
})
