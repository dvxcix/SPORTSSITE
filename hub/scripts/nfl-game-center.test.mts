import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildNflGameCenter, type NflCenterFeed, type NflCenterStat } from '../src/lib/nflGameCenter.ts'
import type { ESPNGame } from '../packages/core/src/espn-api.ts'

// Entirely synthetic: no provider calls, current games, or holdout results.
const team = (id: string, abbr: string) => ({ id, uid: id, location: abbr, name: abbr,
  abbreviation: abbr, displayName: abbr, shortDisplayName: abbr, color: '123456', alternateColor: 'ffffff', logo: '' })
const game: ESPNGame = {
  id: '2000_01_PHI_CHI', uid: 'fixture', date: '2000-09-03T17:00:00Z', name: 'Fixture Eagles at Fixture Bears', shortName: 'PHI @ CHI',
  status: { clock: 0, displayClock: '', period: 0, type: { id: 'live', name: 'Live', state: 'in', completed: false, description: 'Live', detail: 'Live', shortDetail: 'Live' } },
  competitions: [{ id: '123', competitors: [
    { id: '1', uid: '1', order: 0, type: 'team', homeAway: 'away', team: team('1', 'PHI'), score: '7' },
    { id: '2', uid: '2', order: 1, type: 'team', homeAway: 'home', team: team('2', 'CHI'), score: '3' },
  ] }],
}
const stat: NflCenterStat = { game: { id: 123 }, team: { id: 1, abbreviation: 'PHI' }, player: { id: 10, first_name: 'Fixture', last_name: 'Receiver', position_abbreviation: 'WR' }, receptions: 1, receiving_targets: 2, receiving_yards: 18, receiving_touchdowns: 0 }
const feed: NflCenterFeed = { game: { id: 123, visitor_team_q1: 7, home_team_q1: 3, home_team_ot: 0 }, stats: [stat], plays: [
  { id: '2', game: { id: 123 }, period: 1, clock_display: '3:00', type_text: 'Touchdown', scoring_play: true, text: 'Fixture scores', away_score: 7, home_score: 3, team: { abbreviation: 'PHI' }, participants: [{ player_id: 10 }] },
  { id: '1', game: { id: 123 }, period: 1, clock_display: '4:00', type_text: 'Pass', scoring_play: false, text: 'Fixture catch', away_score: 0, home_score: 3 },
] }
test('stored feed maps into the same game-center contract as other sports', () => {
  const result = buildNflGameCenter(game, feed)
  assert.equal(result.summary.header.id, game.id)
  assert.deepEqual(result.summary.plays?.map(p => p.id), ['1', '2'])
  assert.equal(result.summary.plays?.[1].team?.id, '1')
  assert.equal(result.summary.plays?.[1].athletes?.[0].athlete.displayName, 'Fixture Receiver')
  assert.equal(result.summary.header.competitions[0].status.displayClock, '3:00')
})
test('box scores distinguish zero from missing and separate receiving from passing', () => {
  const groups = buildNflGameCenter(game, feed).summary.boxscore!.players![0].statistics
  assert.deepEqual(groups.map(g => g.name), ['Receiving'])
  assert.deepEqual(groups[0].athletes[0].stats, ['1', '2', '18', '—', '0'])
})
test('pregame/missing feed does not invent plays or zero player statistics', () => {
  const result = buildNflGameCenter(game, null)
  assert.deepEqual(result.summary.plays, [])
  assert.equal(result.summary.boxscore, undefined)
  assert.deepEqual(result.quarters[0].periods, [null, null, null, null])
})
test('wrong provider game and mismatched individual rows are excluded', () => {
  assert.equal(buildNflGameCenter(game, { ...feed, game: { id: 999 } }).summary.plays?.length, 0)
  const result = buildNflGameCenter(game, { ...feed, stats: [{ ...stat, game: { id: 999 } }], plays: [{ ...feed.plays![0], game: { id: 999 } }] })
  assert.equal(result.summary.boxscore, undefined)
  assert.deepEqual(result.summary.plays, [])
})
test('duplicate plays excluded; only explicit scoring flag highlights a score', () => {
  const result = buildNflGameCenter(game, { ...feed, plays: [...feed.plays!, feed.plays![0], { ...feed.plays![1], id: '3', text: 'Touchdown nullified', scoring_play: false }] })
  assert.equal(result.summary.plays?.length, 3)
  assert.equal(result.summary.plays?.filter(p => p.scoringPlay).length, 1)
})
test('future quarters stay blank and zero OT placeholders do not create overtime', () => {
  const rows = buildNflGameCenter(game, feed).quarters
  assert.deepEqual(rows[0].periods, [7, null, null, null])
  assert.equal(rows[1].periods.length, 4)
})
test('overtime appears when a fifth period is actually observed', () => {
  const result = buildNflGameCenter(game, { ...feed, plays: [{ ...feed.plays![0], period: 5 }], game: { ...feed.game!, visitor_team_ot: 0, home_team_ot: 3 } })
  assert.equal(result.quarters[0].periods.length, 5)
  assert.equal(result.quarters[1].periods[4], 3)
  assert.equal(result.summary.plays?.[0].period.displayValue, 'OT')
})
test('chronology uses provider sequence before identifiers', () => {
  const result = buildNflGameCenter(game, { ...feed, plays: [{ ...feed.plays![0], sequence_number: 1 }, { ...feed.plays![1], sequence_number: 2 }] })
  assert.deepEqual(result.summary.plays?.map(p => p.id), ['2', '1'])
})
test('NFL links open game center and refresh does not reload the document', () => {
  const source = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
  assert.match(source('src/lib/nflScoreboard.ts'), /appHref: `\/sports\/nfl\//)
  assert.doesNotMatch(source('src/app/sports/[sport]/[gameId]/GameDetailClient.tsx'), /window\.location\.reload/)
  assert.match(source('src/components/sports/useNflGameRefresh.ts'), /visibilityState/)
  assert.match(source('src/lib/nflGameCenterServer.ts'), /revalidate: 30/)
  assert.doesNotMatch(source('src/lib/nflGameCenterServer.ts'), /\.(upsert|insert|update|delete)\(/)
})
