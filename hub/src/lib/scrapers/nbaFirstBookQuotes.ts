import { createHash } from 'node:crypto'
import { nbaName, type PaintGame, type PaintProp, type PaintRoster, type PaintTeam } from '../nbaPaint'
import { nbaGameStart, nbaPregameOpen } from '../nbaOddsMode'
import { nbaValidOdds } from '../nbaOddsHistory'
import { nbaPlayerIdentities } from '../nbaPlayerIdentity'

export type NbaFirstBook = 'draftkings' | 'betmgm'
export type NbaFirstBookInput = { game: PaintGame; roster: PaintRoster[] }
export type NbaFirstBookBoard = {
  away: string; home: string; dateLabel: string; timeLabel: string; timeZone: string
  countdown?: { minutes: number; observedAt: string }
  observedAt: string; market: string; expanded: boolean
  rows: { name: string; odds: string }[]
}
export type NbaFirstBookGame = {
  gameId: number; props: PaintProp[]; complete: boolean; observedAt: string | null
  status: 'captured' | 'partial' | 'unlisted' | 'unavailable' | 'identity-mismatch' | 'closed' | 'deadline' | 'error'
  unmatched: number; clockMismatch: boolean
  identity?: NbaFirstBookIdentity
}
export const nbaFirstBookMissing = (gameId: number, status: NbaFirstBookGame['status']): NbaFirstBookGame => ({ gameId, props: [], complete: false, observedAt: null, status, unmatched: 0, clockMismatch: false })
const identityReasons = ['ambiguous-league-event', 'ambiguous-board', 'no-valid-board', 'invalid-observation-clock', 'future-observation', 'expired-observation', 'invalid-tipoff', 'invalid-time-zone', 'invalid-time-label', 'invalid-date-label', 'wrong-date', 'countdown-tipoff-mismatch', 'away-team', 'home-team', 'wrong-market'] as const
export type NbaFirstBookIdentity = { reason: typeof identityReasons[number]; candidates?: number; validCandidates?: number }
/** Fixed private receipt fields only. Never copy source labels, URLs or errors. */
export function nbaFirstBookIdentityDiagnostic(value: unknown): NbaFirstBookIdentity | undefined {
  if (!value || typeof value !== 'object') return undefined
  const item = value as Record<string, unknown>
  if (!identityReasons.includes(item.reason as NbaFirstBookIdentity['reason'])) return undefined
  const result: NbaFirstBookIdentity = { reason: item.reason as NbaFirstBookIdentity['reason'] }
  for (const field of ['candidates', 'validCandidates'] as const) if (Number.isSafeInteger(item[field]) && Number(item[field]) >= 0) result[field] = Math.min(200, Number(item[field]))
  return result
}
export const nbaFirstBookMismatch = (gameId: number, reason: NbaFirstBookIdentity['reason'], candidates?: number, validCandidates?: number): NbaFirstBookGame => ({
  ...nbaFirstBookMissing(gameId, 'identity-mismatch'), identity: nbaFirstBookIdentityDiagnostic({ reason, candidates, validCandidates }),
})

// Exact book abbreviations observed on the NBA Quick Hits page. These are
// team identities, never a surname/substring fallback for player matching.
const dkCities: Record<string, string> = { NOP: 'NO', SAS: 'SA', GSW: 'GS', PHX: 'PHO', NYK: 'NY', LAC: 'LA', LAL: 'LA' }
export function nbaFirstBookTeam(label: string, team: PaintTeam) {
  const name = nbaName(label)
  return [team.full_name, team.name, `${team.abbreviation} ${team.name}`, `${dkCities[team.abbreviation] ?? team.abbreviation} ${team.name}`,
    ...(team.abbreviation === 'LAC' ? ['Los Angeles Clippers'] : [])].some(value => nbaName(value) === name)
}

function localParts(at: number, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at)
    const value = (key: string) => parts.find(part => part.type === key)?.value ?? ''
    return { date: `${value('year')}-${value('month')}-${value('day')}`, minutes: Number(value('hour')) * 60 + Number(value('minute')) }
  } catch { return null }
}
function displayedDate(label: string, observedDate: string) {
  const clean = label.trim().toLowerCase()
  if (clean === 'today') return observedDate
  if (clean === 'tomorrow') { const day = new Date(`${observedDate}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + 1); return day.toISOString().slice(0, 10) }
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean
  const monthDay = clean.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/)
  return monthDay ? `${monthDay[3] ?? observedDate.slice(0, 4)}-${monthDay[1].padStart(2, '0')}-${monthDay[2].padStart(2, '0')}` : null
}
function displayedMinutes(label: string) {
  const match = label.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 12 || Number(match[2]) > 59) return null
  return (Number(match[1]) % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(match[2])
}
function countdownInterval(countdown: NonNullable<NbaFirstBookBoard['countdown']>) {
  const at = Date.parse(countdown.observedAt)
  return { earliest: at + Math.max(0, countdown.minutes - 1) * 60_000, latest: at + (countdown.minutes + 1) * 60_000 }
}

export type NbaBookIdentity = Pick<NbaFirstBookBoard, 'away' | 'home' | 'dateLabel' | 'timeLabel' | 'timeZone' | 'countdown'>
const identityFields = ['away', 'home', 'dateLabel', 'timeLabel', 'timeZone'] as const
const revalidationReasons = ['missing-identity', 'identity-changed', 'clock-mode-changed', 'countdown-increased', 'countdown-clock-reversed', 'countdown-interval-changed', 'closed', ...identityReasons] as const
export type NbaBookRevalidation = { phase: 'comparison' | 'prior' | 'current'; reason: typeof revalidationReasons[number]; field?: typeof identityFields[number]; canonicalTip: string | null; priorCountdown: { minutes: number; readAt: string } | null; currentCountdown: { minutes: number; readAt: string } | null }
const safeIso = (value: unknown) => { const time = typeof value === 'string' ? Date.parse(value) : NaN; return Number.isFinite(time) ? new Date(time).toISOString() : null }
export function nbaBookRevalidationDiagnostic(value: unknown): NbaBookRevalidation | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  if (typeof raw.phase !== 'string' || !['comparison', 'prior', 'current'].includes(raw.phase) || !revalidationReasons.includes(raw.reason as NbaBookRevalidation['reason'])) return undefined
  const countdown = (item: unknown) => {
    if (!item || typeof item !== 'object') return null
    const clock = item as Record<string, unknown>, readAt = safeIso(clock.readAt)
    return Number.isSafeInteger(clock.minutes) && Number(clock.minutes) >= 0 && Number(clock.minutes) <= 59 && readAt ? { minutes: Number(clock.minutes), readAt } : null
  }
  return { phase: raw.phase as NbaBookRevalidation['phase'], reason: raw.reason as NbaBookRevalidation['reason'], ...(identityFields.includes(raw.field as typeof identityFields[number]) ? { field: raw.field as typeof identityFields[number] } : {}), canonicalTip: safeIso(raw.canonicalTip), priorCountdown: countdown(raw.priorCountdown), currentCountdown: countdown(raw.currentCountdown) }
}
export function nbaBookObservation(input: NbaFirstBookInput, board: NbaBookIdentity & { observedAt: string }, now = Date.now()): NbaFirstBookGame {
  const result = nbaFirstBookMissing(input.game.id, 'identity-mismatch'), at = Date.parse(board.observedAt), start = nbaGameStart(input.game)
  const mismatch = (reason: NbaFirstBookIdentity['reason']) => nbaFirstBookMismatch(input.game.id, reason)
  if (!Number.isFinite(at)) return mismatch('invalid-observation-clock')
  if (at > now + 30_000) return mismatch('future-observation')
  if (now - at > 300_000) return mismatch('expired-observation')
  if (start == null) return mismatch('invalid-tipoff')
  const observed = localParts(at, board.timeZone), scheduled = localParts(start, board.timeZone), current = localParts(now, board.timeZone), clock = displayedMinutes(board.timeLabel)
  if (!observed || !scheduled || !current) return mismatch('invalid-time-zone')
  if (board.countdown) {
    const sourceAt = Date.parse(board.countdown.observedAt), minutes = board.countdown.minutes
    if (!Number.isFinite(sourceAt) || sourceAt > Math.min(at, now) + 30_000 || now - sourceAt > 300_000) return mismatch('invalid-observation-clock')
    if (!Number.isSafeInteger(minutes) || minutes < 0 || minutes > 59 || board.timeLabel) return mismatch('invalid-time-label')
    const sourceDate = localParts(sourceAt, board.timeZone)!.date
    if (board.dateLabel && displayedDate(board.dateLabel, sourceDate) !== scheduled.date) return mismatch('wrong-date')
    if (!nbaFirstBookTeam(board.away, input.game.visitor_team)) return mismatch('away-team')
    if (!nbaFirstBookTeam(board.home, input.game.home_team)) return mismatch('home-team')
    // Like an explicit book clock, a relative clock identifies the event's
    // calendar date without replacing canonical tip. Both possible dates must
    // agree; never infer a date across an ambiguous midnight interval.
    const { earliest, latest } = countdownInterval(board.countdown)
    if (localParts(earliest, board.timeZone)?.date !== scheduled.date || localParts(latest, board.timeZone)?.date !== scheduled.date) return mismatch('wrong-date')
    result.clockMismatch = start < earliest || start > latest
    // The countdown may round either way. Its original DOM read anchors the
    // earliest possible source tip, which can only close capture sooner.
    if (minutes === 0 || !nbaPregameOpen(input.game, at) || !nbaPregameOpen(input.game, now) || Math.max(at, now) >= earliest) return { ...result, status: 'closed', observedAt: board.observedAt }
    return { ...result, status: 'unavailable', observedAt: board.observedAt }
  }
  if (clock == null) return mismatch('invalid-time-label')
  const date = displayedDate(board.dateLabel, observed.date)
  if (date == null) return mismatch('invalid-date-label')
  if (date !== scheduled.date) return mismatch('wrong-date')
  if (!nbaFirstBookTeam(board.away, input.game.visitor_team)) return mismatch('away-team')
  if (!nbaFirstBookTeam(board.home, input.game.home_team)) return mismatch('home-team')
  result.clockMismatch = scheduled.minutes !== clock
  result.observedAt = board.observedAt
  // Canonical tip is never replaced by a sportsbook clock. An earlier book
  // clock can only close capture sooner, never permit a post-tip quote.
  if (!nbaPregameOpen(input.game, at) || !nbaPregameOpen(input.game, now) || (current.date === scheduled.date && current.minutes >= clock)) return { ...result, status: 'closed' }
  return { ...result, status: 'unavailable' }
}

/** Relative clocks may decrement, but their original intervals must overlap
 * and identify this same canonical pregame date. Never restamp a countdown. */
export function nbaSameBookIdentity(input: NbaFirstBookInput, prior: NbaBookIdentity, current: NbaBookIdentity | null, now = Date.now()) {
  return nbaBookIdentityRevalidation(input, prior, current, now) == null
}
export function nbaBookIdentityRevalidation(input: NbaFirstBookInput, prior: NbaBookIdentity, current: NbaBookIdentity | null, now = Date.now()): NbaBookRevalidation | null {
  const failure = (phase: NbaBookRevalidation['phase'], reason: NbaBookRevalidation['reason'], field?: NbaBookRevalidation['field']) => nbaBookRevalidationDiagnostic({ phase, reason, field, canonicalTip: input.game.datetime ?? input.game.status,
    priorCountdown: prior.countdown ? { minutes: prior.countdown.minutes, readAt: prior.countdown.observedAt } : null,
    currentCountdown: current?.countdown ? { minutes: current.countdown.minutes, readAt: current.countdown.observedAt } : null })!
  if (!current) return failure('comparison', 'missing-identity')
  const field = identityFields.find(key => current[key] !== prior[key])
  if (field) return failure('comparison', 'identity-changed', field)
  if (Boolean(prior.countdown) !== Boolean(current.countdown)) return failure('comparison', 'clock-mode-changed')
  if (prior.countdown && current.countdown) {
    if (current.countdown.minutes > prior.countdown.minutes) return failure('comparison', 'countdown-increased')
    if (Date.parse(current.countdown.observedAt) < Date.parse(prior.countdown.observedAt)) return failure('comparison', 'countdown-clock-reversed')
  }
  for (const [phase, identity] of [['prior', prior], ['current', current]] as const) {
    const result = nbaBookObservation(input, { ...identity, observedAt: identity.countdown?.observedAt ?? new Date(now).toISOString() }, now)
    if (result.status !== 'unavailable') return failure(phase, result.identity?.reason ?? 'closed')
  }
  if (prior.countdown && current.countdown) {
    const before = countdownInterval(prior.countdown), after = countdownInterval(current.countdown)
    if (Math.max(before.earliest, after.earliest) > Math.min(before.latest, after.latest)) return failure('comparison', 'countdown-interval-changed')
  }
  return null
}

export function nbaNormalizeFirstBook(book: NbaFirstBook, input: NbaFirstBookInput, board: NbaFirstBookBoard, now = Date.now()): NbaFirstBookGame {
  const result = nbaBookObservation(input, board, now)
  if (['closed', 'identity-mismatch'].includes(result.status)) return result
  if (board.market !== (book === 'draftkings' ? '1st Point' : 'First field goal scorer')) return nbaFirstBookMismatch(input.game.id, 'wrong-market')
  if (!board.rows.length) return { ...result, status: 'unavailable' }
  const identities = nbaPlayerIdentities(input.roster.filter(player => [input.game.home_team.id, input.game.visitor_team.id].includes(player.team.id)))
  const quotes = new Map<number, PaintProp>(), conflicts = new Set<number>()
  for (const row of board.rows) {
    const matches = identities.filter(identity => identity.names.includes(nbaName(row.name)))
    const odds = /^[+\-−]\d{3,7}$/.test(row.odds.trim()) ? Number(row.odds.replace('−', '-')) : NaN
    if (matches.length !== 1 || !nbaValidOdds(odds)) { result.unmatched++; continue }
    const player = matches[0].player, prior = quotes.get(player.id), prop = book === 'draftkings' ? 'first_score' : 'first_field_goal'
    if (prior) { result.unmatched++; if (prior.market.over_odds !== odds) conflicts.add(player.id); continue }
    const key = `${input.game.id}:${player.id}:${book}:${prop}:over_under:0.5:over`
    quotes.set(player.id, { id: -3_000_000_000_000 - parseInt(createHash('sha256').update(key).digest('hex').slice(0, 12), 16), game_id: input.game.id, player_id: player.id,
      vendor: book, prop_type: prop, line_value: '0.5', market: { type: 'over_under', over_odds: odds }, updated_at: board.observedAt })
  }
  result.props = [...quotes].filter(([id]) => !conflicts.has(id)).map(([, quote]) => quote)
  result.complete = board.expanded && result.props.length > 0 && result.unmatched === 0
  result.status = result.complete ? 'captured' : result.props.length ? 'partial' : 'unavailable'
  return result
}
