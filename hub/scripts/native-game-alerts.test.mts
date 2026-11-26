import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ESPNPlay, ESPNSummary } from '../packages/core/src/espn-api'
import { gameAlertEvents, gameAlertPayload, gameAlertScope, nearHomeRunGameAlert } from '../src/lib/nativeGameAlerts'
import type { DailyContactEvent } from '../src/lib/contactRecapTypes'
import { shouldSuppressNotificationDelivery } from '../src/lib/notificationDelivery'

const now = Date.parse('2026-11-26T19:30:00Z')
const timestamp = (ago: number) => new Date(now - ago * 1000).toISOString()
const nfl = gameAlertScope('nfl', '2026_12_CHI_DET', '2026-11-26')!
const nba = gameAlertScope('nba', '401000002', '2026-11-26')!
const mlb = gameAlertScope('mlb', '845101', '2026-11-26')!

const play = (id: string, type: string, properties: Partial<ESPNPlay> = {}): ESPNPlay => ({
  id, type: { id: '', text: type }, text: type, wallclock: timestamp(30), sequenceNumber: id,
  awayScore: 0, homeScore: 0, scoringPlay: false, clock: { displayValue: '2:25' },
  period: { number: 1, displayValue: 'Q1' }, ...properties,
})

function summary(id: string, plays: ESPNPlay[], final = false): ESPNSummary {
  const teams = (['away', 'home'] as const).map((homeAway, index) => ({
    homeAway, team: { abbreviation: index ? 'DET' : 'CHI', displayName: '', color: '', alternateColor: '', logo: '' },
    score: final ? index ? '28' : '20' : String(index ? plays.at(-1)?.homeScore ?? 0 : plays.at(-1)?.awayScore ?? 0),
  }))
  return { header: { id, competitions: [{ competitors: teams, status: { clock: 0, displayClock: '', period: 1,
    type: { state: final ? 'post' : 'in', shortDetail: final ? 'Final/OT' : '2:25 - 1st', completed: final } } }] }, plays }
}

test('NFL sends separate confirmed scoring plays and impactful turnovers with one stable event per play', () => {
  const td = play('1', 'Passing Touchdown', { homeScore: 6, scoringPlay: true, scoreValue: 6 })
  const events = gameAlertEvents(nfl, summary(nfl.gameId, [
    td, td,
    play('2', 'Extra Point Good', { homeScore: 7, scoringPlay: true, scoreValue: 1 }),
    play('3', 'Rush', { homeScore: 7, text: 'Runner FUMBLES, recovered by CHI.' }),
    play('4', 'Fumble Recovery', { homeScore: 7, text: 'Fumble overturned after review.' }),
    play('5', 'Pass Interception', { homeScore: 7 }),
    play('6', 'Timeout', { homeScore: 7 }),
    play('7', 'Field Goal Good', { homeScore: 7, awayScore: 3, scoringPlay: true, scoreValue: 3 }),
  ]), now)
  assert.deepEqual(events.map(event => event.title), ['Touchdown', 'Extra point', 'Fumble', 'Interception', 'Field goal'])
  assert.equal(events[2].subtitle, 'CHI 0 · DET 7')
  const payload = gameAlertPayload(nfl, events[2])
  assert.equal(payload.gamePath, '/sports/nfl/2026_12_CHI_DET?play=3')
  assert.equal(payload.aps['thread-id'], 'game:nfl:2026_12_CHI_DET')
})

test('NBA uses actual score changes and groups two provider period-end entries into a single halftime', () => {
  const period = { number: 2, displayValue: 'Q2' }
  const events = gameAlertEvents(nba, summary(nba.gameId, [
    play('1', 'Three Point Jumper', { scoringPlay: true, scoreValue: 3, awayScore: 3 }),
    play('2', 'Free Throw', { scoringPlay: true, scoreValue: 1, awayScore: 3 }),
    play('3', 'Free Throw', { scoringPlay: true, scoreValue: 1, awayScore: 4 }),
    play('4', 'End Period', { awayScore: 4 }),
    play('5', 'End of 2nd Quarter', { awayScore: 4, period }),
    play('6', 'Halftime', { awayScore: 4, period }),
    play('7', 'Substitution', { awayScore: 4, period }),
  ]), now)
  assert.deepEqual(events.map(event => event.title), ['Three-pointer', 'Free throw made', 'End of Q1', 'Halftime'])
  assert.equal(events[3].key, 'period:2')
})

test('freshness and game identity prevent archive, stale, pending and future events from being delivered', () => {
  const events = gameAlertEvents(nfl, summary(nfl.gameId, [
    play('1', 'End of 3rd Quarter', { wallclock: timestamp(301), period: { number: 3, displayValue: 'Q3' } }),
    play('2', 'Fumble Recovery', { wallclock: undefined }),
    play('3', 'Pass Interception', { wallclock: timestamp(-10) }),
    play('4', 'End of Game', { wallclock: timestamp(30), period: { number: 4, displayValue: 'Q4' } }),
  ], true), now)
  assert.deepEqual(events.map(event => event.title), ['Final'])
  assert.equal(events[0].expiresAt - events[0].occurredAt, 300_000)
  assert.equal(events[0].subtitle, 'CHI 20 · DET 28')
  assert.deepEqual(gameAlertEvents(nfl, summary(nba.gameId, [], true), now), [])
  assert.deepEqual(gameAlertEvents(nfl, summary(nfl.gameId, [play('1', 'End of Game', { wallclock: timestamp(301) })], true), now), [])
  assert.equal(gameAlertScope('nba', nfl.gameId, '2026-11-26'), null)
  assert.equal(gameAlertScope('nfl', nfl.gameId, '2026-11-31'), null)
})

test('allows a second delivery pass after delayed NFL ingestion and keeps the NBA freshness limit', () => {
  const delayed = play('5', 'End of Half', { wallclock: timestamp(181), period: { number: 2, displayValue: 'Q2' } })
  assert.deepEqual(gameAlertEvents(nfl, summary(nfl.gameId, [delayed]), now).map(event => event.title), ['Halftime'])
  assert.deepEqual(gameAlertEvents(nba, summary(nba.gameId, [delayed]), now), [])
})

test('MLB alerts contain a confirmed home run and verified near-home-run contact details', () => {
  const homeRun = play('4', 'Home Run', { awayScore: 2, scoringPlay: true })
  assert.equal(gameAlertEvents(mlb, summary(mlb.gameId, [homeRun]), now)[0].title, 'Home run')
  const contact = {
    kind: 'near_hr', gamePk: Number(mlb.gameId), gameDate: mlb.date, eventTime: timestamp(30),
    atBatIndex: 7, pitchNumber: 4, batterId: 3, batterName: 'Test Batter', distance: 385, exitVelocity: 105.23, parksHrCount: 12,
  } as DailyContactEvent
  const near = nearHomeRunGameAlert(mlb, contact, now)
  assert.equal(near?.path, '/sports/mlb/845101?play=7')
  assert.equal(near?.body, '385 ft · 105.2 mph exit velocity · HR in 12 parks')
  assert.equal(nearHomeRunGameAlert(mlb, { ...contact, eventTime: timestamp(151) }, now), null)
})

test('game alerts respect quiet hours unless the account enabled live-game priority', () => {
  const quiet = { quiet_hours_enabled: true, quiet_start: '21:00', quiet_end: '07:00', timezone: 'UTC' }
  const night = new Date('2026-11-27T04:00:00Z')
  assert.equal(shouldSuppressNotificationDelivery({ ...quiet, live_game_priority: false }, 'game_alert', null, night), true)
  assert.equal(shouldSuppressNotificationDelivery({ ...quiet, live_game_priority: true }, 'game_alert', null, night), false)
})

test('native game artwork uses the play score, both team logos and the identifiable player', () => {
  const legitimatePortrait = 'https://static.www.nfl.com/image/upload/f_auto,q_auto/league/sdrq7yje01g4fvsikoga'
  const compactPortrait = 'https://static.www.nfl.com/image/upload/f_auto,q_auto/c_limit,w_480,h_480/league/sdrq7yje01g4fvsikoga'
  const scoring = play('1', 'Rushing Touchdown', {
    text: '(Shotgun) K.Monangai right tackle for 2 yards, TOUCHDOWN. C.Santos extra point is GOOD.',
    awayScore: 6, scoringPlay: true,
    athletes: [
      { athlete: { id: '2', displayName: 'Cairo Santos', headshot: { href: 'https://a.espncdn.com/i/headshots/nfl/players/full/1234.png' } } },
      { athlete: { id: '4608686', displayName: 'Kyle Monangai', headshot: { href: legitimatePortrait } } },
    ],
  })
  const match = summary(nfl.gameId, [scoring,
    play('2', 'End of 1st quarter', { awayScore: 7, homeScore: 0 })])
  const competition = match.header.competitions[0]
  const [away, home] = competition.competitors
  away.team = { ...away.team, logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/scoreboard/chi.png', color: '#0B162A' }
  home.team = Object.assign(home.team, { logos: [{ href: 'https://a.espncdn.com/i/teamlogos/nfl/500/det.png' }] })
  const [first, second] = gameAlertEvents(nfl, match, now).map(event => gameAlertPayload(nfl, event))
  assert.equal(first.aps.alert.title, '🏈 Touchdown')
  assert.equal(first.aps['mutable-content'], 1)
  assert.equal(first.artwork?.kind, 'game')
  if (first.artwork?.kind !== 'game' || second.artwork?.kind !== 'game') assert.fail('expected native game artwork')
  assert.equal(first.artwork.away.score, 6)
  assert.equal(first.artwork.away.primary, '0B162A')
  assert.equal(first.artwork.home.logo, 'https://a.espncdn.com/i/teamlogos/nfl/500/det.png')
  assert.equal(first.artwork.portrait, compactPortrait)
  assert.equal(first.artwork.portraitSide, 'away')
  assert.equal(second.artwork.portrait, undefined)
  assert.equal(second.artwork.away.score, 7)
  assert.ok(Buffer.byteLength(JSON.stringify(first)) < 4096)
})

test('NFL receiving touchdowns feature the named receiver ahead of the passer', () => {
  const portrait = (id: string) => `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`
  const scoring = play('3', 'Passing Touchdown', {
    text: '(Shotgun) J.Goff pass short right to S.LaPorta for 12 yards, TOUCHDOWN.', homeScore: 6, scoringPlay: true,
    athletes: [
      { athlete: { id: '3046779', displayName: 'Jared Goff', headshot: { href: portrait('3046779') } } },
      { athlete: { id: '4430027', displayName: 'Sam LaPorta', headshot: { href: portrait('4430027') } } },
    ],
  })
  const event = gameAlertEvents(nfl, summary(nfl.gameId, [scoring]), now)[0]
  assert.equal(event.artwork?.kind, 'game')
  if (event.artwork?.kind !== 'game') assert.fail('expected a portrait for the named receiver')
  assert.equal(event.artwork.player, 'Sam LaPorta')
  assert.equal(event.artwork.portrait, portrait('4430027'))
})
