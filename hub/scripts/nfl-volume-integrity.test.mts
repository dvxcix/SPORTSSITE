import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

// Exercise the pure accumulator without starting server-only DB dependencies.
const source = readFileSync(new URL('../src/app/the-sideline/boardAnalysis.ts', import.meta.url), 'utf8')
const exports: Record<string, (...args: unknown[]) => any> = {}
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: () => ({}), console })

test('complete play counts and denominators replace overlapping partial volume', () => {
  const teams = [{ abbr: 'NE', name: 'Patriots', color: '#123', logo: null }]
  const tracking = [{ player_gsis_id: 'one', player_display_name: 'Receiver One', team_abbr: 'NE', week: 0, targets: 100, receptions: 70, yards: 900 }]
  const plays = [
    { posteam: 'NE', week: 1, pass_attempt: 1, receiver_player_id: 'one', complete_pass: 1, yards_gained: 25, pass_touchdown: 1 },
    { posteam: 'NE', week: 2, pass_attempt: 1, receiver_player_id: 'other', complete_pass: 0, yards_gained: 0 },
    { posteam: 'NE', week: 2, pass_attempt: 1, receiver_player_id: 'one', complete_pass: 0, yards_gained: 0 },
    { posteam: 'SEA', week: 2, pass_attempt: 1, receiver_player_id: 'one', complete_pass: 1, yards_gained: 60 },
  ]
  const rows = exports.buildPlayers(tracking, [], [], plays, teams, new Map(), new Map(), [{ receiving_targets: 1 }], [])
  assert.equal(rows[0].targets, 2)
  assert.equal(rows[0].receptions, 1)
  assert.equal(rows[0].receivingYards, 25)
  assert.equal(rows[0].touchdowns, 1)
  assert.equal(rows[0].games, 2)
  assert.equal(rows[0].targetShare, 66.7)
})
