import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/app/the-sideline/boardAnalysis.ts', import.meta.url), 'utf8')
const exports: Record<string, (...args: any[]) => any> = {}
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: () => ({}), console })
const teams = [{ abbr: 'LAR', name: 'Rams', color: '#123', logo: null }]
const play = (overrides: Record<string, unknown> = {}) => ({
  game_id: '2026_01_SF_LA', week: 1, posteam: 'LA', defteam: 'SF',
  play_type: 'pass', pass_attempt: true, receiver_player_id: 'receiver',
  receiver_player_name: 'Receiver', passer_player_id: 'qb', passer_player_name: 'Quarterback',
  complete_pass: true, yards_gained: 15, receiving_yards: 15, passing_yards: 15,
  air_yards: 10, yardline_100: 15, ...overrides,
})
const build = (plays: Record<string, unknown>[], tracking: Record<string, unknown>[] = []) =>
  exports.buildPlayers(tracking, [], [], plays, teams, new Map(), new Map(), [], [], [])
const find = (rows: any[], id = 'receiver') => rows.find(row => row.id === id)

test('PBP-only receivers get volume, air yards, share and red-zone targets without NGS', () => {
  const receiver = find(build([play(), play({ air_yards: -2, complete_pass: false, receiving_yards: 0 })]))
  assert.equal(receiver.targets, 2)
  assert.equal(receiver.receptions, 1)
  assert.equal(receiver.receivingYards, 15)
  assert.equal(receiver.airYards, 4)
  assert.equal(receiver.totalAirYards, 8)
  assert.equal(receiver.airYardsShare, 100)
  assert.equal(receiver.targetShare, 100)
  assert.equal(receiver.redZoneTargets, 2)
  assert.equal(receiver.redZoneCarries, 0)
  assert.equal(receiver.redZoneTargetShare, 100)
  assert.equal(receiver.team, 'LAR')
  assert.ok(!receiver.unavailableMetrics.includes('airYards'))
  assert.ok(receiver.unavailableMetrics.includes('separation'))
})

test('zero air yards is known, but missing air yards never becomes zero', () => {
  const zero = find(build([play({ air_yards: 0 })]))
  assert.equal(zero.airYards, 0)
  assert.ok(!zero.unavailableMetrics.includes('airYards'))
  assert.ok(zero.unavailableMetrics.includes('airYardsShare')) // zero denominator
  const missing = find(build([play(), play({ air_yards: null })]))
  assert.equal(missing.totalAirYards, undefined)
  assert.ok(missing.unavailableMetrics.includes('airYards'))
  assert.ok(missing.unavailableMetrics.includes('airYardsShare'))
})

test('catch and completion percentages require opportunities, not a position label', () => {
  const rows = build([play({complete_pass:false,receiving_yards:0,passing_yards:0})])
  const receiver = find(rows)
  const qb = find(rows,'qb')
  assert.equal(receiver.catchRate,0)
  assert.ok(!receiver.unavailableMetrics.includes('catchRate'))
  assert.ok(receiver.unavailableMetrics.includes('completionRate'))
  assert.equal(qb.completionRate,0)
  assert.ok(!qb.unavailableMetrics.includes('completionRate'))
  assert.ok(qb.unavailableMetrics.includes('catchRate'))
  const trick = find(build([play(),play({passer_player_id:'receiver',receiver_player_id:'other'})]))
  assert.equal(trick.completionRate,100)
  assert.ok(!trick.unavailableMetrics.includes('completionRate'))
})

test('shares use every teammate and signed air yards, not tracking-qualified players', () => {
  const rows = build([play({ air_yards: -5 }), play({ receiver_player_id: 'other', air_yards: 25 })])
  assert.equal(find(rows).targetShare, 50)
  assert.equal(find(rows).airYardsShare, -25)
  assert.equal(find(rows, 'other').airYardsShare, 125)
})

test('nullified plays, deleted plays and two-point conversions are not box-score production', () => {
  const rows = build([play(), play({ play_type: 'no_play' }), play({ play_deleted: true }), play({ two_point_attempt: true })])
  assert.equal(find(rows).targets, 1)
  assert.equal(find(rows).redZoneTargets, 1)
  assert.equal(find(rows, 'qb').passAttempts, 1)
})

test('red-zone carries and targets have separate team denominators', () => {
  const rows = build([play(), play({ pass_attempt: false, rush_attempt: true, play_type: 'run', receiver_player_id: null, rusher_player_id: 'runner', rusher_player_name: 'Runner', rushing_yards: 3 })])
  assert.equal(find(rows).redZoneTargetShare, 100)
  assert.equal(find(rows, 'runner').redZoneCarryShare, 100)
  assert.equal(find(rows, 'runner').redZoneTargets, 0)
})

test('recorded receiver yardage excludes penalty yards; lateral yardage belongs to lateral receiver', () => {
  const rows = build([
    play({ yards_gained: 30, receiving_yards: 15, passing_yards: 15 }),
    play({ yards_gained: 11, receiving_yards: 1, passing_yards: 11, lateral_receiver_player_id: 'other', lateral_receiver_player_name: 'Other', lateral_receiving_yards: 10 }),
    play({ receiver_player_id: 'other', receiving_yards: 5, passing_yards: 5 }),
  ])
  assert.equal(find(rows).receivingYards, 16)
  assert.equal(find(rows, 'other').receivingYards, 15)
  assert.equal(find(rows, 'other').receptions, 1)
  assert.equal(find(rows, 'qb').passingYards, 31)
})

test('partial/null NGS metrics do not claim tracking coverage', () => {
  const row = find(build([play()], [{player_gsis_id: 'receiver',team_abbr:'LA',player_display_name:'Receiver',week:1,targets:5,avg_separation:null,avg_intended_air_yards:90}]))
  assert.equal(row.targets,1)
  assert.equal(row.airYards,10)
  assert.ok(row.unavailableMetrics.includes('separation'))
})

test('current-season tracking is frozen before kickoff week, including aggregates', () => {
  const rows = [{week:0},{week:1},{week:2},{week:3}]
  assert.deepEqual(Array.from(exports.trackingBeforeGame(rows,2026,{season:2026,week:2}), (r:any)=>r.week), [1])
  assert.equal(exports.trackingBeforeGame(rows,2025,{season:2026,week:2}).length,4)
})

test('board query requests air fields and retains pregame date boundary', () => {
  assert.match(source, /air_yards,play_deleted,play_type,two_point_attempt/)
  assert.match(source, /\.lt\('game_date', game.gameday\)/)
  const client = readFileSync(new URL('../src/app/the-sideline/SidelineBoardClient.tsx', import.meta.url), 'utf8')
  assert.match(client, /windowPlayer\.unavailableMetrics\?\.includes\(factor.field\)/)
})

test('same abbreviated names on opposite teams cannot transfer red-zone usage', () => {
  const rows = build([
    play({receiver_player_name:'M.Washington',yardline_100:60}),
    play({posteam:'SF',receiver_player_id:'opponent',receiver_player_name:'M.Washington'}),
  ])
  assert.equal(find(rows).redZoneTargets,0)
})
