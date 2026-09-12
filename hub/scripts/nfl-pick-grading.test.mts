import test from 'node:test'
import assert from 'node:assert/strict'
import { aggregateNflStatFromPlays, gradeNflPick, type NflPendingPick } from '../src/lib/nflPickGrading'

const base: NflPendingPick = {
  id: 'pick', post_id: null, game_pk: '2026_01_A_B', player_id: 'player-1', player_name: 'Test Runner',
  pick_type: 'rushing_yards', market_side: 'over', numeric_line: 54.5,
}
const stats = [{
  player_id: 'player-1', player_display_name: 'Test Runner', rushing_yards: 61, carries: 14,
  receiving_yards: 28, receptions: 4, targets: 6, rushing_tds: 1, receiving_tds: 0, special_teams_tds: 0,
}]
const plays = [
  { play_id: 12, qtr: 1, touchdown: true, pass_touchdown: false, rush_touchdown: true, passer_player_id: null, receiver_player_id: null, rusher_player_id: 'player-1', kickoff_returner_player_id: null, punt_returner_player_id: null, fumble_recovery_1_player_id: null, interception_player_id: null },
  { play_id: 88, qtr: 4, touchdown: true, pass_touchdown: true, rush_touchdown: false, passer_player_id: 'qb-2', receiver_player_id: 'receiver-2', rusher_player_id: null, kickoff_returner_player_id: null, punt_returner_player_id: null, fumble_recovery_1_player_id: null, interception_player_id: null },
]

test('grades over and under yardage against the stored numeric line', () => {
  assert.equal(gradeNflPick(base, stats, plays), 'win')
  assert.equal(gradeNflPick({ ...base, market_side: 'under' }, stats, plays), 'loss')
  assert.equal(gradeNflPick({ ...base, numeric_line: 61 }, stats, plays), 'push')
})

test('grades combined scrimmage yards', () => {
  assert.equal(gradeNflPick({ ...base, pick_type: 'rushing_receiving_yards', numeric_line: 84.5 }, stats, plays), 'win')
  assert.equal(gradeNflPick({ ...base, pick_type: 'rushing_receiving_yards', numeric_line: 90.5 }, stats, plays), 'loss')
})

test('grades touchdown scorer markets by the scoring player, not the passer', () => {
  assert.equal(gradeNflPick({ ...base, pick_type: 'first_td', numeric_line: null, market_side: 'milestone' }, stats, plays), 'win')
  assert.equal(gradeNflPick({ ...base, player_id: 'qb-2', player_name: 'Other Quarterback', pick_type: 'first_td', numeric_line: null, market_side: 'milestone' }, [{ player_id: 'qb-2', player_display_name: 'Other Quarterback', passing_tds: 1 }], plays), 'loss')
  assert.equal(gradeNflPick({ ...base, pick_type: 'anytime_td_1h', numeric_line: .5 }, stats, plays), 'win')
})

test('does not guess a result when the player has no official stat row', () => {
  assert.equal(gradeNflPick({ ...base, player_id: 'absent-player' }, [], plays), null)
})

test('falls back to official play-by-play when the season stat import is late', () => {
  const livePlays = [
    { play_id: 1, qtr: 1, touchdown: false, pass_touchdown: false, rush_touchdown: false, pass_attempt: true, complete_pass: true, interception: false, passing_yards: 18, receiving_yards: 18, rushing_yards: 0, passer_player_id: 'qb-1', receiver_player_id: 'player-1', rusher_player_id: null, kickoff_returner_player_id: null, punt_returner_player_id: null, fumble_recovery_1_player_id: null, interception_player_id: null },
    { play_id: 2, qtr: 2, touchdown: false, pass_touchdown: false, rush_touchdown: false, pass_attempt: true, complete_pass: false, interception: false, passing_yards: 0, receiving_yards: 0, rushing_yards: 0, passer_player_id: 'qb-1', receiver_player_id: 'player-1', rusher_player_id: null, kickoff_returner_player_id: null, punt_returner_player_id: null, fumble_recovery_1_player_id: null, interception_player_id: null },
    { play_id: 3, qtr: 3, touchdown: true, pass_touchdown: false, rush_touchdown: true, pass_attempt: false, rush_attempt: true, complete_pass: false, interception: false, passing_yards: 0, receiving_yards: 0, rushing_yards: 7, passer_player_id: null, receiver_player_id: null, rusher_player_id: 'player-1', kickoff_returner_player_id: null, punt_returner_player_id: null, fumble_recovery_1_player_id: null, interception_player_id: null },
  ]
  assert.deepEqual(aggregateNflStatFromPlays('player-1', livePlays), {
    player_id: 'player-1', targets: 2, receptions: 1, receiving_yards: 18,
    carries: 1, rushing_yards: 7, rushing_tds: 1,
  })
  assert.equal(gradeNflPick({ ...base, pick_type: 'receiving_yards', numeric_line: 17.5 }, [], livePlays), 'win')
  assert.equal(gradeNflPick({ ...base, pick_type: 'anytime_td', numeric_line: 0.5 }, [], livePlays), 'win')
})
