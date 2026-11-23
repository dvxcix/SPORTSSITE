import assert from 'node:assert/strict'
import test from 'node:test'
import { contextualNflScore, nflContextVolume, nflScoreContext, type NflContextPlayer } from '../src/lib/nflContextScore'

const player: NflContextPlayer = {
  position: 'RB',
  games: 10,
  volume: 70,
  geometry: 48,
  redZone: 76,
  breakaway: 62,
  evidence: 82,
  targets: 45,
  receptions: 36,
  receivingYards: 320,
  carries: 165,
  rushingYards: 760,
  passAttempts: 0,
  completions: 0,
  passingYards: 0,
  passingTouchdowns: 0,
  touchdowns: 9,
  targetShare: 14,
  carryShare: 62,
  airYards: 1.3,
  airYardsShare: 3,
  separation: 2.8,
  yacAboveExpected: 0.8,
  rushOverExpected: 0.6,
  catchRate: 80,
  completionRate: 0,
  cpoe: 0,
  timeToThrow: 0,
  redZoneLooks: 34,
  goalLineLooks: 12,
  explosivePlays: 18,
  dvp: { rushing_yards: 12, rushing_tds: 18, receiving_yards: -8 },
  teamProfile: { passRate: 49, neutralPassRate: 51, successRate: 52, explosiveRate: 11, redZoneTdRate: 63, thirdDownRate: 44 },
  opponentProfile: { defenseSuccessAllowed: 54, defenseExplosiveAllowed: 52 },
}

test('classifies every major player-prop family independently', () => {
  assert.equal(nflScoreContext('anytime_td', 'RB').family, 'touchdown')
  assert.equal(nflScoreContext('receiving_yards', 'WR').family, 'receiving')
  assert.equal(nflScoreContext('rushing_yards', 'RB').family, 'rushing')
  assert.equal(nflScoreContext('rushing_receiving_yards', 'RB').family, 'scrimmage')
  assert.equal(nflScoreContext('passing_yards', 'QB').family, 'passing')
  assert.equal(nflScoreContext('passing_tds', 'QB').family, 'passing')
})

test('produces market-specific scores for the same player', () => {
  const td = contextualNflScore(player, 'anytime_td', .62, 48).score
  const receiving = contextualNflScore(player, 'receiving_yards', .62, 48).score
  const rushing = contextualNflScore(player, 'rushing_yards', .62, 48).score
  const scrimmage = contextualNflScore(player, 'rushing_receiving_yards', .62, 48).score
  assert.notEqual(td, receiving)
  assert.ok(rushing > receiving)
  assert.ok(scrimmage >= receiving)
})

test('uses matching opponent DvP rather than a universal matchup input', () => {
  const favorableRush = contextualNflScore(player, 'rushing_yards', .55, 46).score
  const hostileRush = contextualNflScore({ ...player, dvp: { ...player.dvp, rushing_yards: -25 } }, 'rushing_yards', .55, 46).score
  const receivingUnchanged = contextualNflScore({ ...player, dvp: { ...player.dvp, rushing_yards: -25 } }, 'receiving_yards', .55, 46).score
  assert.ok(favorableRush > hostileRush)
  assert.equal(receivingUnchanged, contextualNflScore(player, 'receiving_yards', .55, 46).score)
})

test('passing TD score uses passing touchdowns, not scorer touchdowns', () => {
  const quarterback = { ...player, position: 'QB', passAttempts: 340, completions: 225, passingYards: 2550, passingTouchdowns: 20, touchdowns: 0, dvp: { passing_tds: 10 } }
  const passingTd = contextualNflScore(quarterback, 'passing_tds', .5, 47).score
  const noPassingTdProduction = contextualNflScore({ ...quarterback, passingTouchdowns: 0 }, 'passing_tds', .5, 47).score
  assert.ok(passingTd > noPassingTdProduction)
})

const quarterback: NflContextPlayer = {
  ...player, position: 'QB', passAttempts: 340, completions: 225,
  passingYards: 2550, passingTouchdowns: 20, touchdowns: 2,
  targets: 0, targetShare: 0, carries: 45, carryShare: 18,
  dvp: { passing_tds: -25, rushing_tds: 0 },
}

for (const prop of ['anytime_td', 'first_td', 'anytime_td_1h', 'anytime_td_1q', '2+_tds']) {
  test(`${prop}: passer production, passing matchup and dropback volume cannot inflate scorer score`, () => {
    const baseline = contextualNflScore(quarterback, prop, .5, 47).score
    const passingOnly = { ...quarterback, passingTouchdowns: 31, passAttempts: 500,
      completions: 400, passingYards: 4200, completionRate: 80, cpoe: 15,
      volume: 100, geometry: 100, evidence: 100, dvp: { ...quarterback.dvp, passing_tds: 25 } }
    assert.equal(contextualNflScore(passingOnly, prop, .5, 47).score, baseline)
    assert.equal(nflContextVolume(passingOnly, prop), nflContextVolume(quarterback, prop))
  })
}

test('QB scorer score responds to personal rushing opportunities and rushing-TD matchup', () => {
  const score = (value: NflContextPlayer) => contextualNflScore(value, 'anytime_td', .5, 47).score
  assert.ok(score({ ...quarterback, dvp: { ...quarterback.dvp, rushing_tds: 25 } }) > score({ ...quarterback, dvp: { ...quarterback.dvp, rushing_tds: -25 } }))
  assert.ok(score({ ...quarterback, carryShare: 50 }) > score({ ...quarterback, carryShare: 0 }))
  assert.ok(score({ ...quarterback, touchdowns: 9, redZoneLooks: 50, goalLineLooks: 20 }) > score({ ...quarterback, touchdowns: 0, redZoneLooks: 0, goalLineLooks: 0 }))
})

test('receiving/trick-play scorers use targets and carries while passing markets retain passer volume', () => {
  const receiver = { ...player, position: 'WR', volume: 99, targetShare: 20, carryShare: 0, passAttempts: 40, passingTouchdowns: 10 }
  assert.equal(nflContextVolume(receiver, 'anytime_td'), 30)
  assert.equal(nflContextVolume({ ...receiver, targetShare: 0 }, 'anytime_td'), 0)
  assert.equal(contextualNflScore(receiver, 'anytime_td').score, contextualNflScore({ ...receiver, passingTouchdowns: 0, volume: 0 }, 'anytime_td').score)
  assert.equal(nflContextVolume(quarterback, 'passing_tds'), quarterback.volume)
  assert.equal(nflContextVolume(quarterback, 'role'), quarterback.volume)
  assert.ok(contextualNflScore(quarterback, 'passing_tds').score > contextualNflScore({ ...quarterback, passingTouchdowns: 0 }, 'passing_tds').score)
})
