import { nbaName, type PaintGame } from './nbaPaint'
import { nbaGameStart, nbaPregameOpen } from './nbaOddsMode'

export type NbaPublicEventIdentity = { id: string; start: string; away: { full: string; short: string }; home: { full: string; short: string } }
type Game = Pick<PaintGame, 'datetime' | 'status' | 'status_state' | 'period' | 'date' | 'visitor_team' | 'home_team'>
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const eventId = /^[a-z0-9-]{1,80}$/

/** Only the observed NBA listing/event response origins can supply identity. */
export function nbaPublicResponseKind(value: string): 'listing' | 'event' | null {
  try {
    const url = new URL(value)
    if (url.origin !== 'https://prod-website.pikkit.app') return null
    if (url.pathname === '/league/events') return 'listing'
    return /^\/event\/[a-z0-9-]{1,80}$/.test(url.pathname) && !url.search ? 'event' : null
  } catch { return null }
}

export function nbaPublicEventIdentities(url: string, payload: unknown): NbaPublicEventIdentity[] {
  const kind = nbaPublicResponseKind(url)
  if (!kind) return []
  const expectedId = kind === 'event' ? new URL(url).pathname.split('/').at(-1) : null
  const found: NbaPublicEventIdentity[] = []
  let visited = 0, incomplete = false
  const visit = (value: unknown, depth: number) => {
    if (++visited > 20000 || depth > 10) { incomplete = true; return }
    if (Array.isArray(value)) { for (const item of value) visit(item, depth + 1); return }
    const row = object(value)
    if (!row) return
    const info = object(row.event_info), league = object(info?.league), away = object(info?.away), home = object(info?.home)
    const team = (value: Record<string, unknown> | null) => typeof value?.full === 'string' && value.full.length > 0 && value.full.length <= 120 && typeof value.short === 'string' && /^[A-Z0-9]{2,4}$/.test(value.short) ? { full: value.full, short: value.short } : null
    const awayTeam = team(away), homeTeam = team(home), start = typeof row.start_time === 'string' ? Date.parse(row.start_time) : NaN
    if (league?.short === 'NBA' && typeof row._id === 'string' && eventId.test(row._id) && (!expectedId || row._id === expectedId) && awayTeam && homeTeam && Number.isFinite(start)) {
      found.push({ id: row._id, start: new Date(start).toISOString(), away: awayTeam, home: homeTeam })
    }
    for (const item of Object.values(row)) if (item && typeof item === 'object') visit(item, depth + 1)
  }
  visit(payload, 0)
  return incomplete ? [] : found
}

function matches(game: Game, event: NbaPublicEventIdentity, now: number) {
  const start = nbaGameStart(game)
  return start !== null && nbaPregameOpen(game, now) && Date.parse(event.start) === start
    && new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(start)) === game.date
    && event.away.short === game.visitor_team.abbreviation && event.home.short === game.home_team.abbreviation
    && nbaName(event.away.full) === nbaName(game.visitor_team.full_name) && nbaName(event.home.full) === nbaName(game.home_team.full_name)
}

export function nbaVerifiedPublicEvent(game: Game, events: NbaPublicEventIdentity[], now = Date.now()): NbaPublicEventIdentity | null {
  const matching = events.filter(event => matches(game, event, now))
  const ids = new Set(matching.map(event => event.id))
  if (ids.size > 1) throw new Error('NBA event identity is ambiguous')
  const selected = matching[0]
  if (selected && events.some(event => event.id === selected.id && !matches(game, event, now))) throw new Error('NBA event identity is conflicting')
  return selected ?? null
}

export function nbaPublicEventUrl(event: NbaPublicEventIdentity) { return `https://app.pikkit.com/event/${event.id}` }

export function nbaPublicEventPageMatches(game: Game, event: NbaPublicEventIdentity, url: string, text: string, now = Date.now()) {
  return matches(game, event, now) && url.replace(/\/$/, '') === nbaPublicEventUrl(event)
    && [event.away.full, event.home.full].every(name => nbaName(text).includes(nbaName(name)))
}
