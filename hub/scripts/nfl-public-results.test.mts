import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { gradeNflPublicProp, type NflPublicResult } from '../src/lib/nflPublicResults.ts'
import { nflPriorWeek, pregameDvp } from '../src/lib/nflPregameHistory.ts'
import type { NflOddsPlayer } from '../src/lib/nflOddsTypes.ts'

const player: NflOddsPlayer = { id: 1, gsisId: 'player-1', name: 'Josh Palmer', team: 'BUF', position: 'WR', markets: [] }
const result = (status = 'in_progress', yards = 43): NflPublicResult => ({ status, updatedAt: '2026-09-18T02:00:00Z', firstTd: null, firstTdKnown: false,
  players: [{ id: 1, name: 'Joshua Palmer', team: 'BUF', stats: { receiving_yards: yards, receptions: 1, anytime_td: 1 } }] })
const yards = (line: number) => ({ propType: 'receiving_yards', line, kind: 'milestone' as const })

test('live higher ladders remain pending, reached rungs are not final settlement', () => {
  assert.equal(gradeNflPublicProp(result(), player, yards(40)).state, 'reached')
  assert.equal(gradeNflPublicProp(result(), player, yards(50)).state, 'pending')
  assert.equal(gradeNflPublicProp(result('final'), player, yards(40)).state, 'hit')
  assert.equal(gradeNflPublicProp(result('final'), player, yards(50)).state, 'miss')
})
test('exact equality distinguishes milestone, over/under and push; live unders cannot cash early', () => {
  const prop = { propType: 'receiving_yards', line: 43, kind: 'over_under' as const }
  assert.equal(gradeNflPublicProp(result('final'), player, prop).state, 'push')
  assert.equal(gradeNflPublicProp(result('final'), player, yards(43)).state, 'hit')
  assert.equal(gradeNflPublicProp(result(), player, { ...prop, line: 60, side: 'under' }).state, 'pending')
})
test('passing TDs are not anytime scores; missing stats and period data never become losses', () => {
  assert.equal(gradeNflPublicProp(result('final'), player, { propType: 'passing_tds', line: 1 }).state, 'unavailable')
  assert.equal(gradeNflPublicProp(result('final'), player, { propType: 'anytime_td_1h', line: 1 }).state, 'unavailable')
  assert.equal(gradeNflPublicProp({ ...result('final'), players: [] }, player, yards(40)).state, 'unavailable')
  assert.equal(gradeNflPublicProp(result('final'), player, { propType: 'receiving_yards' }).state, 'unavailable')
})
test('first TD settles once known, unlike other scorers anytime TD; failed feed is not no-TD evidence', () => {
  const td = { propType: 'first_td' }
  assert.equal(gradeNflPublicProp(result('final'), player, td).state, 'pending')
  const scored = { ...result(), firstTdKnown: true, firstTd: { id: 2, gsisId: null, name: 'Other Player', team: 'BUF' } }
  assert.equal(gradeNflPublicProp(scored, player, td).state, 'miss')
  assert.equal(gradeNflPublicProp(scored, player, { propType: 'anytime_td' }).state, 'reached')
  assert.equal(gradeNflPublicProp({ ...scored, firstTd: { id: 1, gsisId: null, name: 'Joshua Palmer', team: 'BUF' } }, player, td).state, 'hit')
})
test('weeks 2/3/4 exclude same-week, future-week and cumulative week-zero records', () => {
  for (const week of [2, 3, 4]) {
    const actual = [0, 1, 2, 3, 4, 5].filter(value => nflPriorWeek(value, 2026, { season: 2026, week }))
    assert.deepEqual(actual, Array.from({ length: week - 1 }, (_, i) => i + 1))
  }
})
test('DVP uses prior observations only and preserves per-game teammate aggregation', () => {
  const rows = [
    { week: 1, opponent_team: 'BUF', position: 'WR', receiving_yards: 100 },
    { week: 1, opponent_team: 'BUF', position: 'WR', receiving_yards: 50 },
    { week: 1, opponent_team: 'DET', position: 'WR', receiving_yards: 50 },
    { week: 2, opponent_team: 'BUF', position: 'WR', receiving_yards: 9999 },
  ].filter(row => nflPriorWeek(row.week, 2026, { season: 2026, week: 2 }))
  const value = pregameDvp(rows).find(row => row.opponent_team === 'BUF' && row.stat_category === 'receiving_yards')!
  assert.equal(value.games, 1)
  assert.equal(value.pct_diff, 50)
})
test('customer diagnostics are server-gated and historical caches are versioned', () => {
  assert.match(readFileSync('src/app/the-sideline/page.tsx', 'utf8'), /gate\.isAdmin \? <Suspense/)
  assert.match(readFileSync('src/app/the-sideline/SidelineCheatsheets.tsx', 'utf8'), /isAdmin \? <section/)
  assert.match(readFileSync('src/app/the-sideline/analysis.ts', 'utf8'), /\.lt\('week', beforeWeek\)/)
  assert.doesNotMatch(readFileSync('src/app/the-sideline/analysis.ts', 'utf8'), /\.eq\('week', 0\)/)
})
