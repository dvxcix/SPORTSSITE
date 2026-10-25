import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { visibleMlbProps, visibleMlbPublicRows, visibleMlbMechanics, hasCompleteMlbPaperInputs } from '../src/lib/mlbResearchAccess.ts'
import { computePaperScores, computeMmRanks, type RankInputRow } from '../src/lib/dugoutPaperScore.ts'

const start = Date.parse('2026-10-25T20:00:00Z')
const game = { gamePk: 42, gameDate: new Date(start).toISOString(), status: { detailedState: 'Scheduled' } }
type Row = { payload: any; observed_at: string; start_at: string; source: string }
const stored = (value: any = { mix: 42 }, time = start - 5000): Row => ({ payload: value, observed_at: new Date(time).toISOString(), start_at: game.gameDate, source: 'capture' })
async function harness() {
  let now = start - 1000, row: Row | null = null, readCount = 0, writes = 0
  let onRead: (() => Row | null) | null = null, onWrite: ((args: any) => Row | null) | null = null
  const resources: string[] = []
  class Clock extends Date { constructor(value: string | number = now) { super(value) } static now() { return now } }
  const db = { rpc(name: string, args: any) {
    assert.equal(args.p_game_pk, '42'); resources.push(args.p_resource)
    return { async abortSignal() {
      if (name === 'read_mlb_pregame_research') { readCount++; return { data: structuredClone(onRead ? onRead() : row), error: null } }
      assert.equal(name, 'capture_mlb_pregame_research'); writes++
      row = onWrite ? onWrite(args) : stored(args.p_payload, Date.parse(args.p_observed_at))
      return { data: structuredClone(row), error: null }
    } }
  } }
  const source = await readFile(new URL('../src/lib/mlbPregameResearchData.ts', import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'Date', output)((id: string) => {
    if (id === 'server-only') return {}
    assert.equal(id, './supabase/admin'); return { createAdminClient: () => db }
  }, module, module.exports, Clock)
  return { api: module.exports as typeof import('../src/lib/mlbPregameResearchData.ts'),
    time(value: number) { now = value }, row(value: Row | null) { row = structuredClone(value) },
    onRead(fn: () => Row | null) { onRead = fn }, onWrite(fn: (args: any) => Row | null) { onWrite = fn },
    counts: () => ({ readCount, writes }), resources }
}

test('closed MLB board returns its archive without running current loader', async () => {
  const h = await harness(); h.time(start); h.row(stored())
  const result = await h.api.mlbPregameResearch(game, async () => { throw Error('Must not load') })
  assert.equal(result.frozen, true); assert.deepEqual(result.value, { mix: 42 }); assert.equal(h.counts().writes, 0)
})
test('missing historical research is unavailable rather than recalculated', async () => {
  const h = await harness(); h.time(start)
  await assert.rejects(h.api.mlbPregameResearch(game, async () => { throw Error('Must not load') }), h.api.MlbPregameResearchUnavailable)
  assert.equal(h.counts().writes, 0)
})
test('an in-progress game closes before an erroneously later scheduled timestamp', async () => {
  const h = await harness(); h.row(stored())
  const result = await h.api.mlbPregameResearch({ ...game, status: { detailedState: 'In Progress' } }, async () => { throw Error('Must not load') })
  assert.equal(result.frozen, true); assert.equal(h.counts().writes, 0)
})
test('canonical earlier start cannot reopen when schedule is delayed', async () => {
  const h = await harness(); h.time(start + 1000); h.row(stored())
  const delayed = { ...game, gameDate: new Date(start + 3600000).toISOString() }
  const result = await h.api.mlbPregameResearch(delayed, async () => { throw Error('Must not load') })
  assert.equal(result.frozen, true); assert.equal(h.counts().writes, 0)
})
test('read-only access does not invoke capture or replace full-tier input', async () => {
  const h = await harness(); h.row(stored({ prices: [450], mix: [42] }))
  assert.deepEqual((await h.api.readMlbPregameResearch(game))?.value, { prices: [450], mix: [42] })
  assert.equal(h.counts().writes, 0)
  const source = await readFile(new URL('../src/lib/dugoutData.ts', import.meta.url), 'utf8')
  assert.match(source, /researchSnapshot = isUltimate\s*\? await mlbPregameResearch/)
})
test('loader crossing start returns the existing final bundle', async () => {
  const h = await harness(); h.row(stored({ mix: 'prior' }))
  const result = await h.api.mlbPregameResearch(game, async () => { h.time(start); return { value: { mix: 'new' }, observedAt: new Date(start - 10).toISOString() } })
  assert.deepEqual(result.value, { mix: 'prior' }); assert.equal(h.counts().writes, 0)
})
test('a delayed RPC crossing start resolves the database winner under a fresh read', async () => {
  const h = await harness(); h.row(stored())
  h.onWrite(() => { h.time(start); return stored({ mix: 'authoritative' }, start - 1) })
  const result = await h.api.mlbPregameResearch(game, async () => ({ value: { mix: 'candidate' }, observedAt: new Date(start - 1500).toISOString() }))
  assert.deepEqual(result.value, { mix: 'authoritative' }); assert.equal(result.frozen, true)
})
test('a read that crosses start re-reads the final committed writer', async () => {
  const h = await harness(); let calls = 0
  h.onRead(() => { calls++; if (calls === 1) { h.time(start); return stored({ mix: 'older' }) } return stored({ mix: 'final' }, start - 1) })
  assert.deepEqual((await h.api.readMlbPregameResearch(game))?.value, { mix: 'final' })
  assert.equal(calls, 2)
})
test('parallel readers get isolated object graphs', async () => {
  const h = await harness(); h.row(stored({ rows: [{ mix: 10 }] }))
  const [first, second] = await Promise.all([h.api.readMlbPregameResearch<any>(game), h.api.readMlbPregameResearch<any>(game)])
  first!.value.rows[0].mix = 99
  assert.equal(second!.value.rows[0].mix, 10)
})
test('custom provider logs use a separate game/player resource', async () => {
  const h = await harness()
  const result = await h.api.mlbPregameResearch(game, async () => ({ value: { rows: [{ game_date: '2026-10-24', batter_id: 7 }] }, observedAt: new Date(start - 1500).toISOString() }), 'pitchlog:7')
  assert.equal(result.value.rows[0].batter_id, 7); assert.ok(h.resources.every(resource => resource === 'pitchlog:7'))
  await assert.rejects(h.api.readMlbPregameResearch(game, 'user-private-rule'))
})
test('invalid or future observations never replace a valid archive', async () => {
  const h = await harness(); h.row(stored())
  const result = await h.api.mlbPregameResearch(game, async () => ({ value: { mix: 99 }, observedAt: new Date(start + 100).toISOString() }))
  assert.deepEqual(result.value, { mix: 42 }); assert.equal(h.counts().writes, 0)
})
const player = (overrides: Partial<RankInputRow> = {}): RankInputRow => ({ matchup_edge: 5, s_brl: 12, s_spd: 75, r_spd: 76, platoon_ops: .8, s_pa: 15, s_sq: 30, r_sq: 32, s_hh: 40, s_ev: 90, s_timing: 35, r_timing: 36, recent_pitch_count: 50, sa_fd: 400, ...overrides })
test('one unavailable research baseline suppresses the whole peer Paper/MM pool', () => {
  const rows = [player({ research_available: false, paper: 99, mm: 10, pp_rk: 1 }), player({ matchup_edge: 10, paper: 99, mm: 10, pp_rk: 2 })]
  computePaperScores(rows); computeMmRanks(rows)
  assert.ok(rows.every(row => row.paper == null && row.pp_rk == null && row.mm == null))
  assert.ok(rows.every(row => row.bk_rk != null)) // Frozen book prices remain usable.
})
test('complete archived input preserves Paper and game-relative ranks', () => {
  const rows = [player({ research_available: true }), player({ research_available: true, matchup_edge: 10, sa_fd: 300 })]
  computePaperScores(rows); computeMmRanks(rows)
  assert.ok(rows.every(row => row.paper != null && row.mm != null))
})
test('final response and custom inputs have start-boundary guards', async () => {
  const source = await readFile(new URL('../src/lib/dugoutData.ts', import.meta.url), 'utf8')
  assert.match(source, /finalResearchResolvers\[gameIndex\]/)
  assert.match(source, /readMlbPregameResearch<\{ rows: any\[\] \}>\(g, `pitchlog:\$\{id\}`\)/)
  assert.match(source, /row\.game_date\.slice\(0, 10\) < date/)
  assert.match(source, /customPitchlogAvailable \|\| !matrix\.factors/)
})

test('full-depth shared payload is redacted again for Basic and Advanced callers', () => {
  const props = { sa: { fanduel: 400 }, open: { saFd: 450 } }
  assert.equal(visibleMlbProps(props, false, false), null)
  assert.deepEqual(visibleMlbProps(props, true, false), { sa: { fanduel: 400 } })
  assert.deepEqual(visibleMlbProps(props, true, true), props)
  assert.equal(visibleMlbMechanics({ index: 77 }, false), null)
  assert.deepEqual(visibleMlbPublicRows([{ picks: 12, movement: { delta: 3 } }], false), [{ picks: 12, movement: null }])
  assert.deepEqual(props.open, { saFd: 450 })
})

test('a first partial baseline cannot advertise a complete Paper/MM pool', () => {
  const windows = Object.fromEntries(['season','l1','l3','l5','l10'].map(window => [window, { barrelPct: null }]))
  const input = { homeLineup: [{ mlb_id: 1 }], awayLineup: [{ mlb_id: 2 }], homePitcher: { id: 3, hand: 'R' }, awayPitcher: { id: 4, hand: 'R' }, pitcherSplits: [{ mlb_id: 3, pct_fastball: 60 }, { mlb_id: 4, pct_fastball: 70 }], statcast: { 1: { R: windows }, 2: { R: windows } }, batterMatchup: { 1: {}, 2: {} }, pitcherMatchup: { 3: {}, 4: {} } }
  assert.equal(hasCompleteMlbPaperInputs(input), true)
  assert.equal(hasCompleteMlbPaperInputs({ ...input, pitcherSplits: [{ mlb_id: 3, pct_fastball: 60 }] }), false)
  assert.equal(hasCompleteMlbPaperInputs({ ...input, statcast: { 1: { R: windows } } }), false)
  assert.equal(hasCompleteMlbPaperInputs({ ...input, pitcherMatchup: { 3: {} } }), false)
})
