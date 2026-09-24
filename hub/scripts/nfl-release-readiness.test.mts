import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { attachNflPeriodResults, attachNflBdlPeriodResults } from '../src/lib/nflPeriodResults.ts'
import { gradeNflPublicProp, type NflResultPlayer } from '../src/lib/nflPublicResults.ts'
const player = (): NflResultPlayer => ({ id: 1, gsisId: 'receiver', name: 'Receiver', team: 'BUF', stats: { receptions: 3, receiving_yards: 75, anytime_td: 1, rushing_yards: 0, rushing_attempts: 0 } })
const pass = (qtr: number, yards: number, extra = {}) => ({ qtr, play_type: 'pass', pass_attempt: true, complete_pass: true, passer_player_id: 'qb', receiver_player_id: 'receiver', passing_yards: yards, receiving_yards: yards, ...extra })
const plays = [pass(1, 40, { touchdown: true, td_player_id: 'receiver' }), pass(3, 25), pass(5, 10)]

test('period splits reconcile; second half includes OT but Q4 does not; TD belongs to scorer', () => {
  const p = player()
  attachNflPeriodResults([p], plays, true)
  assert.equal(p.stats.receiving_yards_1h, 40)
  assert.equal(p.stats.receiving_yards_2h, 35)
  assert.equal(p.stats.receiving_yards_4q, 0)
  assert.equal(p.stats.receptions_1q, 1)
  assert.equal(p.stats.anytime_td_1q, 1)
  assert.equal(p.stats.anytime_td_2h, 0)
  assert.equal(p.stats.rushing_receiving_yards_2h, 35)
})
test('missing/truncated feeds and mismatched totals do not manufacture period losses', () => {
  const p = player()
  attachNflPeriodResults([p], plays.slice(0, 1), true)
  assert.equal(p.stats.receiving_yards_1q, undefined)
  attachNflPeriodResults([p], plays, false)
  assert.equal(p.stats.receiving_yards_1q, undefined)
  const q = player()
  attachNflPeriodResults([q], [...plays, pass(2, 500, { play_type: 'no_play' }), pass(2, 500, { two_point_attempt: true })], true)
  assert.equal(q.stats.receiving_yards_1h, 40)
})
test('longest pass is credited completed pass yardage, not net/sack yardage', () => {
  const qb: NflResultPlayer = { id: 2, gsisId: 'qb', name: 'QB', team: 'BUF', stats: { passing_yards: 75, passing_completions: 3, passing_attempts: 3 } }
  attachNflPeriodResults([qb], [...plays, { qtr: 2, sack: true, pass_attempt: true, passer_player_id: 'qb', passing_yards: -10 }], true)
  assert.equal(qb.stats.longest_pass, 40)
  assert.equal(qb.stats.passing_attempts_1h, 1)
})
test('live BDL periods require matching independent box totals; no early miss', () => {
  const p = player(); p.stats = { receptions: 1, receiving_yards: 40 }
  const event = { id: 10, game: { id: 100 }, period: 1, type_slug: 'pass-reception', stat_yardage: 40, participants: [{ type: 'receiver', player_id: 1 }, { type: 'passer', player_id: 2 }] }
  attachNflBdlPeriodResults([p], [event], 100)
  assert.equal(p.stats.receiving_yards_1h, 40)
  const result = { status: 'in_progress', updatedAt: '', players: [p], firstTd: null, firstTdKnown: false }
  const identity = { id: 1, name: 'Receiver', team: 'BUF', position: 'WR', markets: [] }
  assert.equal(gradeNflPublicProp(result, identity, { propType: 'receiving_yards_1h', line: 50, kind: 'milestone' }).state, 'pending')
  assert.equal(gradeNflPublicProp({ ...result, status: 'final' }, identity, { propType: 'receiving_yards_1h', line: 40, kind: 'milestone' }).state, 'hit')
  const other = player(); other.stats.receiving_yards = 200
  attachNflBdlPeriodResults([other], [event], 100)
  assert.equal(other.stats.receiving_yards_1h, undefined)
})
test('period TDs default to one touchdown and missing final results are explicit', () => {
  const p = player(); attachNflPeriodResults([p], plays, true)
  const result = { status: 'final', updatedAt: '', players: [p], firstTd: null, firstTdKnown: false }
  const identity = { id: 1, name: 'Receiver', team: 'BUF', position: 'WR', markets: [] }
  assert.equal(gradeNflPublicProp(result, identity, { propType: 'anytime_td_1h' }).state, 'hit')
  assert.equal(gradeNflPublicProp(result, identity, { propType: 'anytime_td_2h' }).state, 'miss')
  assert.equal(gradeNflPublicProp(result, identity, { propType: 'unknown_market', line: 1 }).label, 'Result unavailable')
})
test('cheatsheet sample, completions, login context and polling are wired', () => {
  const read = (p: string) => readFileSync(p, 'utf8')
  assert.match(read('src/app/the-sideline/page.tsx'), /getCachedSidelineCheatsheetLens\(selected, sample\)/)
  assert.match(read('src/app/the-sideline/analysis.ts'), /getNflPregameWeekly\(season, beforeWeek, phase\)/)
  assert.match(read('src/app/the-sideline/SidelineCheatsheets.tsx'), /passing_completions: 'completions'/)
  assert.match(read('src/lib/supabase/middleware.ts'), /url.searchParams.set\('next', `\$\{request.nextUrl.pathname\}\$\{request.nextUrl.search\}`\)/)
  assert.match(read('src/app/the-sideline/SidelineResearchClient.tsx'), /summary=1/)
  assert.match(read('src/app/the-sideline/SidelineResearchClient.tsx'), /setBoard\(next.odds\)/)
})
