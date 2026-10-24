import { createHash } from 'node:crypto'
import { nbaName, type PaintGame, type PaintProp, type PaintRoster, type PaintTeam } from '../nbaPaint'
import { nbaGameStart, nbaPregameOpen } from '../nbaOddsMode'
import { nbaValidOdds } from '../nbaOddsHistory'
import { nbaPlayerIdentities } from '../nbaPlayerIdentity'

export type NbaFirstBook = 'draftkings' | 'betmgm'
export type NbaFirstBookInput = { game: PaintGame; roster: PaintRoster[] }
export type NbaFirstBookBoard = {
  away: string; home: string; dateLabel: string; timeLabel: string; timeZone: string
  observedAt: string; market: string; expanded: boolean
  rows: { name: string; odds: string }[]
}
export type NbaFirstBookGame = {
  gameId: number; props: PaintProp[]; complete: boolean; observedAt: string | null
  status: 'captured' | 'partial' | 'unlisted' | 'unavailable' | 'identity-mismatch' | 'closed' | 'deadline' | 'error'
  unmatched: number; clockMismatch: boolean
}
export const nbaFirstBookMissing = (gameId: number, status: NbaFirstBookGame['status']): NbaFirstBookGame => ({ gameId, props: [], complete: false, observedAt: null, status, unmatched: 0, clockMismatch: false })

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

export function nbaBookObservation(input: NbaFirstBookInput, board: Pick<NbaFirstBookBoard, 'away' | 'home' | 'dateLabel' | 'timeLabel' | 'timeZone' | 'observedAt'>, now = Date.now()): NbaFirstBookGame {
  const result = nbaFirstBookMissing(input.game.id, 'identity-mismatch'), at = Date.parse(board.observedAt), start = nbaGameStart(input.game)
  if (!Number.isFinite(at) || at > now + 30_000 || now - at > 300_000 || start == null) return result
  const observed = localParts(at, board.timeZone), scheduled = localParts(start, board.timeZone), current = localParts(now, board.timeZone), clock = displayedMinutes(board.timeLabel)
  if (!observed || !scheduled || !current || clock == null || displayedDate(board.dateLabel, observed.date) !== scheduled.date
    || !nbaFirstBookTeam(board.away, input.game.visitor_team) || !nbaFirstBookTeam(board.home, input.game.home_team)) return result
  result.clockMismatch = scheduled.minutes !== clock
  result.observedAt = board.observedAt
  // Canonical tip is never replaced by a sportsbook clock. An earlier book
  // clock can only close capture sooner, never permit a post-tip quote.
  if (!nbaPregameOpen(input.game, at) || !nbaPregameOpen(input.game, now) || (current.date === scheduled.date && current.minutes >= clock)) return { ...result, status: 'closed' }
  return { ...result, status: 'unavailable' }
}

export function nbaNormalizeFirstBook(book: NbaFirstBook, input: NbaFirstBookInput, board: NbaFirstBookBoard, now = Date.now()): NbaFirstBookGame {
  const result = nbaBookObservation(input, board, now)
  if (['closed', 'identity-mismatch'].includes(result.status)) return result
  if (board.market !== (book === 'draftkings' ? '1st Point' : 'First field goal scorer')) return nbaFirstBookMissing(input.game.id, 'identity-mismatch')
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
