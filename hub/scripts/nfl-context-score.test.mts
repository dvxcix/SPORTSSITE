import assert from 'node:assert/strict'
import test from 'node:test'
import { contextualNflScore, nflScoreContext, type NflContextPlayer } from '../src/lib/nflContextScore'

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
