import 'server-only'
import { createHash } from 'node:crypto'
import { getPaintRoster } from './nbaPaintData'
import { getNbaFirstEvents } from './nbaFirstBasketOddsData'
import { nbaFirstEvent, type FirstOddsEvent } from './nbaFirstBasketOdds'
import { nbaName, type PaintGame, type PaintProp, type PaintRoster } from './nbaPaint'
import { nbaGameStart, nbaLiveOpen, nbaPregameOpen, nbaQuoteInMode, nbaQuoteTimeEvidence, type NbaOddsMode, type NbaQuoteTimeReason } from './nbaOddsMode'
import { nbaPlayerIdentities } from './nbaPlayerIdentity'
import { nbaSharedCache } from './nbaSharedCache'
import { nbaValidOdds } from './nbaOddsHistory'

const STATS = ['points', 'rebounds', 'assists', 'threes', 'blocks', 'steals', 'turnovers', 'points_rebounds_assists', 'points_rebounds', 'points_assists', 'rebounds_assists'] as const
export const NBA_SUPPLEMENTAL_MARKETS = [...STATS.map(key => `player_${key}`), ...STATS.map(key => `player_${key}_alternate`), 'player_double_double', 'player_triple_double', 'player_points_q1', 'player_rebounds_q1', 'player_assists_q1']
const BOOKS = ['betmgm', 'draftkings']
const MAX_BYTES = 4_194_304, MAX_OUTCOMES = 20_000
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 120 && !/[\u0000-\u001f]/.test(value)
const date = (time: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(time)
const id = (key: string) => -1_000_000_000_000 - parseInt(createHash('sha256').update(key).digest('hex').slice(0, 12), 16)
export const nbaSupplementalQuote = (quote: PaintProp) => quote.id <= -1_000_000_000_000
export class NbaSupplementalUnavailable extends Error { constructor() { super('Additional sportsbook prices unavailable') } }
type QuoteRejection = NbaQuoteTimeReason
export type NbaSupplementalDiagnostics = { reasons: Partial<Record<QuoteRejection, number>>; samples: { book: string; market: string; reason: QuoteRejection; quoteAt: string | null; checkedAt: string; tipoff: string | null; ageMs: number | null; outcomes: number; source: 'feed' | 'cache' }[] }
export type NbaSupplementalSnapshot = { props: PaintProp[]; complete: boolean; deferred?: boolean; observedAt: string; accepted: number; unmatched: number; stale: number; eventMatched: boolean; applicable: boolean; diagnostics?: NbaSupplementalDiagnostics; quota: { used: number | null; remaining: number | null; last: number | null } | null }

export function nbaSupplementalAllowed(game: PaintGame, mode: NbaOddsMode, now = Date.now()) {
  const start = nbaGameStart(game), today = date(now), tomorrow = new Date(`${today}T12:00:00Z`)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  const dates = [today, tomorrow.toISOString().slice(0, 10)]
  return start != null && dates.includes(game.date) && dates.includes(date(start)) && (mode === 'pregame' ? nbaPregameOpen(game, now) : nbaLiveOpen(game, now))
}
const empty = (): NbaSupplementalSnapshot => ({ props: [], complete: true, observedAt: new Date().toISOString(), accepted: 0, unmatched: 0, stale: 0, eventMatched: false, applicable: false, quota: null })
const fresh = (quote: PaintProp, game: PaintGame, mode: NbaOddsMode, now: number) => nbaQuoteInMode(quote, game, mode, now) && now - Date.parse(quote.updated_at) <= 300_000
const sides = (quote: PaintProp) => ['odds', 'over_odds', 'under_odds'].filter(field => nbaValidOdds(quote.market[field as keyof PaintProp['market']])).length
// Private fixed metadata, never source text or player names. Classify the same
// rejected observations without relaxing phase, future-time or age checks.
function rejection(diagnostics: NbaSupplementalDiagnostics, book: string, market: string, at: string, outcomes: number, source: 'feed' | 'cache', game: PaintGame, mode: NbaOddsMode, now: number) {
  const time = Date.parse(at), tip = nbaGameStart(game)
  const reason: QuoteRejection = !Number.isFinite(time) || tip == null ? 'invalid-clock' : time > now ? 'future' : !nbaQuoteInMode({ updated_at: at }, game, mode, now) ? 'wrong-phase' : 'expired'
  diagnostics.reasons[reason] = (diagnostics.reasons[reason] ?? 0) + outcomes
  if (diagnostics.samples.length < 12) diagnostics.samples.push({ book, market, ...nbaQuoteTimeEvidence(at, game, reason, now), outcomes, source })
}

/** Exact sides are deduplicated independently; different observation times are
 * never stitched into a single quote with a misleading timestamp. */
export function nbaMergePropSources(primary: PaintProp[], supplemental: PaintProp[]) {
  const sides = new Map<string, PaintProp>()
  for (const quote of [...primary, ...supplemental]) {
    const base = `${quote.game_id}:${quote.player_id}:${quote.vendor}:${quote.prop_type}:${quote.market.type}:${Number(quote.line_value)}`
    for (const field of quote.market.type === 'milestone' ? ['odds'] as const : ['over_odds', 'under_odds'] as const) {
      const price = quote.market[field]
      if (!nbaValidOdds(price)) continue
      const key = `${base}:${field}`, prior = sides.get(key)
      // A tie prefers the supplemental exact contract, without comparing prices.
      if (!prior || !Number.isFinite(Date.parse(prior.updated_at)) || Date.parse(quote.updated_at) >= Date.parse(prior.updated_at)) sides.set(key, { ...quote, opening: undefined, market: { type: quote.market.type, [field]: price } })
    }
  }
  const grouped = new Map<string, PaintProp>()
  for (const [key, quote] of sides) {
    const group = `${key.slice(0, key.lastIndexOf(':'))}:${quote.updated_at}`, prior = grouped.get(group)
    grouped.set(group, prior ? { ...prior, id: nbaSupplementalQuote(quote) ? quote.id : prior.id, market: { ...prior.market, ...quote.market } } : quote)
  }
  return [...grouped.values()]
}

export function nbaNormalizeSupplemental(payload: unknown, match: FirstOddsEvent, game: PaintGame, roster: PaintRoster[], mode: NbaOddsMode, now = Date.now()): NbaSupplementalSnapshot {
  if (!object(payload) || payload.sport_key !== 'basketball_nba' || payload.id !== match.id || payload.home_team !== match.home_team || payload.away_team !== match.away_team
    || typeof payload.commence_time !== 'string' || Date.parse(payload.commence_time) !== Date.parse(match.commence_time) || nbaFirstEvent([payload as FirstOddsEvent], game)?.id !== match.id
    || !Array.isArray(payload.bookmakers) || payload.bookmakers.length > BOOKS.length) throw new NbaSupplementalUnavailable()
  const result = { ...empty(), applicable: true, eventMatched: true, observedAt: new Date(now).toISOString(), diagnostics: { reasons: {}, samples: [] } as NbaSupplementalDiagnostics }
  const identities = nbaPlayerIdentities(roster.filter(player => [game.home_team.id, game.visitor_team.id].includes(player.team.id)))
  const seenBooks = new Set<string>(), offers = new Map<string, PaintProp>(), conflicts = new Set<string>()
  let count = 0
  for (const book of payload.bookmakers) {
    if (!object(book) || typeof book.key !== 'string' || !BOOKS.includes(book.key) || seenBooks.has(book.key) || !Array.isArray(book.markets) || book.markets.length > NBA_SUPPLEMENTAL_MARKETS.length) throw new NbaSupplementalUnavailable()
    seenBooks.add(book.key)
    const seenMarkets = new Set<string>()
    for (const market of book.markets) {
      if (!object(market) || typeof market.key !== 'string' || !NBA_SUPPLEMENTAL_MARKETS.includes(market.key) || seenMarkets.has(market.key) || !Array.isArray(market.outcomes)) throw new NbaSupplementalUnavailable()
      seenMarkets.add(market.key)
      count += market.outcomes.length
      if (count > MAX_OUTCOMES) throw new NbaSupplementalUnavailable()
      const at = typeof market.last_update === 'string' ? market.last_update : ''
      if (!fresh({ updated_at: at } as PaintProp, game, mode, now)) { const count = Math.max(1, market.outcomes.length); result.stale += count; rejection(result.diagnostics, book.key, market.key, at, count, 'feed', game, mode, now); continue }
      const alternate = market.key.endsWith('_alternate'), prop = market.key.replace(/^player_/, '').replace(/_alternate$/, '').replace(/_q1$/, '_1q'), binary = ['double_double', 'triple_double'].includes(prop)
      for (const outcome of market.outcomes) {
        if (!object(outcome) || !text(outcome.description) || !nbaValidOdds(outcome.price) || !(binary ? ['Yes', 'No'] : ['Over', 'Under']).includes(String(outcome.name))
          || (binary ? outcome.point != null && outcome.point !== .5 : typeof outcome.point !== 'number' || !Number.isFinite(outcome.point) || outcome.point < 0 || outcome.point > 300)) { result.unmatched++; continue }
        const matches = identities.filter(identity => identity.names.includes(nbaName(outcome.description as string)))
        if (matches.length !== 1) { result.unmatched++; continue }
        const threshold = binary ? .5 : outcome.point as number, over = outcome.name === 'Over' || outcome.name === 'Yes'
        // For integer-count stats only, ALT Over14.5 is exactly15+. Integer
        // Over15 has a push and must remain O/U. Under keeps its original line.
        const milestone = alternate && over && threshold > 0 && threshold % 1 === .5
        const line = milestone ? threshold + .5 : threshold, type = milestone ? 'milestone' : 'over_under', field = milestone ? 'odds' : over ? 'over_odds' : 'under_odds'
        const key = `${game.id}:${matches[0].player.id}:${book.key}:${prop}:${type}:${line}:${field}`
        const quote: PaintProp = { id: id(key), game_id: game.id, player_id: matches[0].player.id, vendor: book.key, prop_type: prop, line_value: String(line), market: { type, [field]: outcome.price }, updated_at: at }
        const prior = offers.get(key)
        if (prior && Date.parse(prior.updated_at) === Date.parse(at) && prior.market[field] !== outcome.price) { conflicts.add(key); result.unmatched++; continue }
        if (!prior || Date.parse(at) >= Date.parse(prior.updated_at)) offers.set(key, quote)
      }
    }
  }
  result.props = nbaMergePropSources([], [...offers].filter(([key]) => !conflicts.has(key)).map(([, quote]) => quote))
  result.accepted = result.props.reduce((n, quote) => n + sides(quote), 0)
  result.complete = result.unmatched === 0 && result.stale === 0
  return result
}

async function boundedJson(response: Response, signal: AbortSignal) {
  const declared = response.headers.get('content-length')
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BYTES)) { void response.body?.cancel().catch(() => {}); throw new NbaSupplementalUnavailable() }
  if (!response.body) throw new NbaSupplementalUnavailable()
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0, value = '', abort: (() => void) | undefined
  const aborted = new Promise<never>((_, reject) => { abort = () => reject(new NbaSupplementalUnavailable()); signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort() })
  try {
    while (true) { const chunk = await Promise.race([reader.read(), aborted]); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > MAX_BYTES) throw new NbaSupplementalUnavailable(); value += decoder.decode(chunk.value, { stream: true }) }
    return JSON.parse(value + decoder.decode()) as unknown
  } finally { if (abort) signal.removeEventListener('abort', abort); void reader.cancel().catch(() => {}) }
}
const quota = (response: Response, name: string) => { const value = response.headers.get(name); return value && /^\d{1,12}$/.test(value) ? Number(value) : null }

/** One paid request per canonical game/phase/120 seconds, regardless of caller.
 * No stale fallback, no refresh flag, no historical or out-of-slate queries. */
export async function getNbaSupplementalProps(game: PaintGame, mode: NbaOddsMode): Promise<NbaSupplementalSnapshot> {
  if (!nbaSupplementalAllowed(game, mode)) return empty()
  const cached = await nbaSharedCache(`supplemental-props:v2:${mode}:${game.id}:${nbaGameStart(game)}`, 120, 0, async () => {
    try {
      const key = process.env.ODDS_API_KEY?.trim()
      if (!key) throw new NbaSupplementalUnavailable()
      const [events, roster] = await Promise.all([getNbaFirstEvents(), getPaintRoster(game)])
      const match = nbaFirstEvent(events, game)
      if (!match) {
        if (events.filter(event => nbaFirstEvent([event], game)).length > 1) throw new NbaSupplementalUnavailable()
        return { ...empty(), applicable: true, complete: false, deferred: true }
      }
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(match.id) || !nbaSupplementalAllowed(game, mode)) throw new NbaSupplementalUnavailable()
      const url = new URL(`https://api.the-odds-api.com/v4/sports/basketball_nba/events/${encodeURIComponent(match.id)}/odds`)
      url.searchParams.set('apiKey', key); url.searchParams.set('bookmakers', BOOKS.join(',')); url.searchParams.set('markets', NBA_SUPPLEMENTAL_MARKETS.join(',')); url.searchParams.set('oddsFormat', 'american')
      const signal = AbortSignal.timeout(12_000), response = await fetch(url, { cache: 'no-store', redirect: 'error', signal })
      if (!response.ok) { void response.body?.cancel().catch(() => {}); throw new NbaSupplementalUnavailable() }
      const parsed = nbaNormalizeSupplemental(await boundedJson(response, signal), match, game, roster, mode)
      if (!nbaSupplementalAllowed(game, mode)) throw new NbaSupplementalUnavailable()
      return { ...parsed, quota: { used: quota(response, 'x-requests-used'), remaining: quota(response, 'x-requests-remaining'), last: quota(response, 'x-requests-last') } }
    } catch { throw new NbaSupplementalUnavailable() } // Never propagate a credential-bearing fetch URL.
  }, 55)
  if (!nbaSupplementalAllowed(game, mode)) return { ...empty(), complete: false }
  const now = Date.now(), diagnostics: NbaSupplementalDiagnostics = { reasons: { ...cached.value.diagnostics?.reasons }, samples: [...(cached.value.diagnostics?.samples ?? [])] }
  let expired = 0
  const props = cached.value.props.filter(quote => {
    if (fresh(quote, game, mode, now)) return true
    const count = sides(quote); expired += count
    rejection(diagnostics, quote.vendor, quote.prop_type, quote.updated_at, count, 'cache', game, mode, now)
    return false
  })
  const accepted = props.reduce((n, quote) => n + sides(quote), 0)
  return { ...cached.value, props, accepted, diagnostics, complete: cached.value.complete && props.length === cached.value.props.length, stale: cached.value.stale + expired }
}
