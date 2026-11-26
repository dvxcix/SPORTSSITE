import type { ESPNPlay, ESPNSummary } from '@slipsurge/core/espn-api'
import type { DailyContactEvent } from './contactRecapTypes'

export const gameAlertSports = ['nfl', 'nba', 'mlb'] as const
type GameAlertSport = typeof gameAlertSports[number]
export type GameAlertScope = { sport: GameAlertSport; gameId: string; date: string }
export type GameAlertKind = 'scoring' | 'major' | 'milestone'
export type GameAlertEvent = {
  key: string
  kind: GameAlertKind
  title: string
  subtitle: string
  body: string
  path: string
  occurredAt: number
  expiresAt: number
}

export function gameAlertScope(sport: string, gameId: string, date: string): GameAlertScope | null {
  const league = gameAlertSports.find(candidate => candidate === sport)
  const validId = /^\d{1,14}$/.test(gameId) || (league === 'nfl' && /^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(gameId))
  if (!league || !validId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date) return null
  return { sport: league, gameId, date }
}

const clean = (value: string | undefined, limit = 170) => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
const score = (value: unknown) => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) return null
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 && number < 1000 ? number : null
}

function playTime(play: ESPNPlay) {
  const raw = play.wallclock
  return typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(raw) ? Date.parse(raw) : NaN
}

function periodEnd(sport: GameAlertSport, play: ESPNPlay) {
  if (sport === 'mlb') return null
  const quarter = play.period?.number
  if (!Number.isInteger(quarter) || quarter < 1) return null
  const title = clean(play.type?.text)
  const text = clean(play.text)
  if (!/^(?:end (?:of (?:the )?)?(?:[1-4](?:st|nd|rd|th) )?(?:quarter|period|half|overtime)|half[- ]?time)\b/i.test(title) &&
      !/^(?:end of (?:the )?(?:[1-4](?:st|nd|rd|th) )?(?:quarter|period|half|overtime)|half[- ]?time)\b/i.test(text) &&
      !/^(?:END_PERIOD|END_QUARTER|END_HALF|HALFTIME)$/i.test(play.type?.id ?? '')) return null
  return quarter === 2 ? 'Halftime' : quarter > 4 ? 'End of overtime' : `End of Q${quarter}`
}

function majorPlay(sport: GameAlertSport, play: ESPNPlay) {
  const type = clean(play.type?.text)
  const description = clean(play.text)
  if (/\b(?:no play|overturned|nullified|incomplete)\b/i.test(type) || /\b(?:no play|overturned|nullified)\b/i.test(description)) return null
  if (sport === 'nfl') {
    if (/\bfumbles?\b/i.test(type) || /\bfumbles?\b/i.test(description)) return 'Fumble'
    if (/intercept/i.test(type) || /\bintercepted\b/i.test(description)) return 'Interception'
    if (/turnover on downs/i.test(type) || /\bturnover on downs\b/i.test(description)) return 'Turnover on downs'
  }
  if (sport === 'nba' && /^(?:flagrant(?: foul)?(?: [12])?|ejection|player ejected)$/i.test(type)) return type
  if (sport === 'mlb' && /^(?:triple play|ejection|player ejected)$/i.test(type)) return type
  return null
}

function pointsTitle(sport: GameAlertSport, play: ESPNPlay) {
  const type = clean(play.type?.text, 48)
  if (sport === 'mlb') return play.type?.id === 'home_run' || /^home run$/i.test(type) ? 'Home run' : 'Run scored'
  if (sport === 'nfl') {
    const text = `${type} ${clean(play.text)}`
    if (/touchdown|\bTD\b/i.test(text) || play.scoreValue === 6) return 'Touchdown'
    if (/field goal|\bFG\b/i.test(text) || play.scoreValue === 3) return 'Field goal'
    if (/safety/i.test(text)) return 'Safety'
    if (play.scoreValue === 2) return 'Two-point conversion'
    if (play.scoreValue === 1) return 'Extra point'
    return 'Scoring play'
  }
  if (play.scoreValue === 3 || /three.point/i.test(type)) return 'Three-pointer'
  if (play.scoreValue === 1 || /free throw/i.test(type)) return 'Free throw made'
  return 'Basket made'
}

export function gameAlertEvents(scope: GameAlertScope, summary: ESPNSummary, now: number): GameAlertEvent[] {
  const match = summary.header?.competitions?.[0]
  const away = match?.competitors.find(team => team.homeAway === 'away')
  const home = match?.competitors.find(team => team.homeAway === 'home')
  const awayTeam = clean(away?.team.abbreviation, 12), homeTeam = clean(home?.team.abbreviation, 12)
  if (!match || summary.header.id !== scope.gameId || !awayTeam || !homeTeam) return []
  const state = match.status?.type
  if (!state || (state.state !== 'in' && state.state !== 'post')) return []
  const path = `/sports/${scope.sport}/${scope.gameId}`
  const formatScore = (a: number, h: number) => `${awayTeam} ${a} · ${homeTeam} ${h}`
  const events = new Map<string, GameAlertEvent>()
  const append = (key: string, kind: GameAlertKind, title: string, subtitle: string, body: string, occurredAt: number, playId?: string) => {
    // NFL play-by-play is imported every two minutes. Allow another
    // scheduled delivery pass if the first one saw the previous snapshot.
    const expiresAt = occurredAt + (key === 'final' || scope.sport === 'nfl' ? 300_000 : 150_000)
    if (!Number.isFinite(occurredAt) || occurredAt > now || expiresAt <= now) return
    if (!events.has(key)) events.set(key, { key, kind, title, subtitle, body, occurredAt, expiresAt,
      path: playId ? `${path}?play=${encodeURIComponent(playId)}` : path })
  }
  let lastAt = -Infinity
  let previous: [number, number] = [0, 0]
  for (const play of summary.plays ?? []) {
    const timestamp = playTime(play)
    if (timestamp <= now) lastAt = Math.max(lastAt, timestamp)
    const a = score(play.awayScore), h = score(play.homeScore)
    if (a == null || h == null || !/^[\w.-]{1,80}$/.test(play.id)) continue
    const scoreboard = formatScore(a, h)
    const quarter = periodEnd(scope.sport, play)
    if (quarter && !(state.completed && play.period.number >= 4)) {
      append(`period:${play.period.number}`, 'milestone', quarter, scoreboard, '', timestamp, play.id)
    }
    const changed = a >= previous[0] && h >= previous[1] && (a > previous[0] || h > previous[1])
    const description = clean(play.text) || clean(play.type?.text)
    if (play.scoringPlay && changed) {
      append(`play:${play.id}`, 'scoring', pointsTitle(scope.sport, play), scoreboard, description, timestamp, play.id)
    } else if (!quarter) {
      const major = majorPlay(scope.sport, play)
      if (major) append(`play:${play.id}`, 'major', major, scoreboard, description, timestamp, play.id)
    }
    previous = [a, h]
  }
  const a = score(away?.score), h = score(home?.score)
  if (state.completed && state.state === 'post' && /^final\b/i.test(state.shortDetail) && a != null && h != null) {
    const winner = h === a ? 'Game tied' : `${h > a ? homeTeam : awayTeam} wins`
    const leaders = (summary.leaders ?? []).slice(0, 2).flatMap(team => {
      const row = team.leaders[0]?.leaders[0]
      return row ? [clean(`${row.athlete.displayName}: ${row.displayValue}`, 75)] : []
    })
    append('final', 'milestone', 'Final', formatScore(a, h), [winner, ...leaders].join(' · '), lastAt)
  }
  return [...events.values()].sort((a, b) => a.occurredAt - b.occurredAt)
}

export function nearHomeRunGameAlert(scope: GameAlertScope, contact: DailyContactEvent | undefined, now: number): GameAlertEvent | null {
  if (scope.sport !== 'mlb' || contact?.kind !== 'near_hr' || String(contact.gamePk) !== scope.gameId ||
      contact.gameDate !== scope.date || !Number.isInteger(contact.atBatIndex) || contact.atBatIndex < 0 ||
      !Number.isInteger(contact.batterId) || !Number.isInteger(contact.pitchNumber)) return null
  const occurredAt = Date.parse(contact.eventTime ?? '')
  const expiresAt = occurredAt + 150_000
  if (!Number.isFinite(occurredAt) || occurredAt > now || expiresAt <= now) return null
  const hasPlayLink = contact.atBatIndex < 500 && contact.pitchNumber > 0
  const path = `/sports/mlb/${scope.gameId}`
  const metrics = [
    contact.distance != null && Number.isFinite(contact.distance) ? `${Math.round(contact.distance)} ft` : '',
    contact.exitVelocity != null && Number.isFinite(contact.exitVelocity) ? `${contact.exitVelocity.toFixed(1)} mph exit velocity` : '',
    contact.parksHrCount != null && Number.isInteger(contact.parksHrCount) ? `HR in ${contact.parksHrCount} parks` : '',
  ]
  return {
    key: `near-hr:${contact.batterId}:${contact.atBatIndex}:${contact.pitchNumber}`,
    kind: 'major', title: 'Near home run', subtitle: clean(contact.batterName, 70),
    body: metrics.filter(Boolean).join(' · ') || clean(contact.description),
    path: hasPlayLink ? `${path}?play=${contact.atBatIndex}` : path, occurredAt, expiresAt,
  }
}

export function gameAlertPayload(scope: GameAlertScope, event: GameAlertEvent) {
  return {
    aps: {
      alert: { title: event.title, subtitle: event.subtitle, body: event.body || 'Open Game Center for the full play-by-play.' },
      category: 'SLIPSURGE_LIVE_GAME',
      'thread-id': `game:${scope.sport}:${scope.gameId}`,
      sound: 'default',
    },
    gamePath: event.path,
  }
}
