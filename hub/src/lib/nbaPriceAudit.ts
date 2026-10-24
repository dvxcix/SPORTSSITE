import 'server-only'
import { getPaintRoster } from './nbaPaintData'
import { getNbaFirstEvents } from './nbaFirstBasketOddsData'
import { nbaFirstEvent, type FirstOddsEvent } from './nbaFirstBasketOdds'
import { nbaName, type PaintGame, type PaintRoster } from './nbaPaint'
import { nbaGameStart, nbaPregameOpen } from './nbaOddsMode'
import { nbaPlayerIdentities } from './nbaPlayerIdentity'
import { nbaSharedCache } from './nbaSharedCache'
import { nbaValidOdds } from './nbaOddsHistory'

const BOOKS = ['betmgm', 'draftkings'] as const
const MARKETS = ['player_points_alternate', 'player_rebounds_alternate', 'player_assists_alternate', 'player_threes_alternate'] as const
const MAX_BYTES = 1_048_576
const MAX_OUTCOMES = 4096
const easternDate = (time: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(time)

export class NbaPriceAuditError extends Error {
  constructor(public code: 'game' | 'configuration' | 'authorization' | 'quota' | 'upstream' | 'payload' | 'budget', public status = 502) {
    super('NBA price audit unavailable')
  }
}

export function nbaPriceAuditGameAllowed(game: PaintGame, now = Date.now()) {
  const start = nbaGameStart(game)
  if (start == null || !nbaPregameOpen(game, now)) return false
  const today = easternDate(now), tomorrow = new Date(`${today}T12:00:00Z`)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  const dates = [today, tomorrow.toISOString().slice(0, 10)]
  return dates.includes(game.date) && dates.includes(easternDate(start))
}

type AuditOutcome = { name: string; description: string; point: number; price: number; playerId: number | null }
type AuditMarket = { key: string; lastUpdate: string; fresh: boolean; outcomes: AuditOutcome[] }
type AuditBook = { key: string; markets: AuditMarket[] }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const shortText = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 120 && !/[\u0000-\u001f]/.test(value)

function parseEvent(payload: unknown, match: FirstOddsEvent, game: PaintGame, roster: PaintRoster[], now: number) {
  if (!object(payload) || payload.sport_key !== 'basketball_nba' || payload.id !== match.id
    || !shortText(payload.home_team) || !shortText(payload.away_team) || !shortText(payload.commence_time)
    || payload.home_team !== match.home_team || payload.away_team !== match.away_team || Date.parse(payload.commence_time) !== Date.parse(match.commence_time)
    || nbaFirstEvent([payload as FirstOddsEvent], game)?.id !== match.id
    || !Array.isArray(payload.bookmakers) || payload.bookmakers.length > BOOKS.length) throw new NbaPriceAuditError('payload')
  const identities = nbaPlayerIdentities(roster.filter(player => [game.home_team.id, game.visitor_team.id].includes(player.team.id)))
  let count = 0
  const seenBooks = new Set<string>(), bookmakers: AuditBook[] = []
  for (const book of payload.bookmakers) {
    if (!object(book) || typeof book.key !== 'string' || !(BOOKS as readonly string[]).includes(book.key) || seenBooks.has(book.key)
      || !Array.isArray(book.markets) || book.markets.length > MARKETS.length) throw new NbaPriceAuditError('payload')
    seenBooks.add(book.key)
    const seenMarkets = new Set<string>(), markets: AuditMarket[] = []
    for (const market of book.markets) {
      if (!object(market) || typeof market.key !== 'string' || !(MARKETS as readonly string[]).includes(market.key) || seenMarkets.has(market.key)
        || !shortText(market.last_update) || !Number.isFinite(Date.parse(market.last_update)) || !Array.isArray(market.outcomes)) throw new NbaPriceAuditError('payload')
      seenMarkets.add(market.key)
      count += market.outcomes.length
      if (count > MAX_OUTCOMES) throw new NbaPriceAuditError('budget')
      const outcomes = market.outcomes.map((outcome: unknown): AuditOutcome => {
        if (!object(outcome) || !['Over', 'Under'].includes(String(outcome.name)) || !shortText(outcome.description)
          || typeof outcome.point !== 'number' || !Number.isFinite(outcome.point) || outcome.point < 0 || outcome.point > 300 || !nbaValidOdds(outcome.price)) throw new NbaPriceAuditError('payload')
        const matches = identities.filter(identity => identity.names.includes(nbaName(outcome.description as string)))
        return { name: outcome.name as string, description: outcome.description, point: outcome.point, price: outcome.price, playerId: matches.length === 1 ? matches[0].player.id : null }
      })
      const age = now - Date.parse(market.last_update)
      markets.push({ key: market.key, lastUpdate: market.last_update, fresh: age >= -30_000 && age <= 300_000, outcomes })
    }
    bookmakers.push({ key: book.key, markets })
  }
  return { event: { id: match.id, homeTeam: payload.home_team, awayTeam: payload.away_team, commenceTime: payload.commence_time }, bookmakers, outcomes: count }
}

async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const declared = response.headers.get('content-length')
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BYTES)) {
    void response.body?.cancel().catch(() => {})
    throw new NbaPriceAuditError('budget')
  }
  if (!response.body) throw new NbaPriceAuditError('payload')
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0, text = ''
  let abort: (() => void) | undefined
  const aborted = new Promise<never>((_, reject) => {
    abort = () => reject(new NbaPriceAuditError('upstream'))
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted])
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_BYTES) throw new NbaPriceAuditError('budget')
      text += decoder.decode(value, { stream: true })
    }
    return JSON.parse(text + decoder.decode())
  } catch (error) {
    if (error instanceof NbaPriceAuditError) throw error
    throw new NbaPriceAuditError('payload')
  } finally {
    if (abort) signal.removeEventListener('abort', abort)
    void reader.cancel().catch(() => {})
  }
}

const quotaCount = (response: Response, name: string) => {
  const value = response.headers.get(name)
  return value && /^\d{1,12}$/.test(value) ? Number(value) : null
}

/** Admin-triggered, fixed-scope diagnostic; never imported into a quote tape. */
export async function getNbaPriceAudit(game: PaintGame) {
  if (!nbaPriceAuditGameAllowed(game)) throw new NbaPriceAuditError('game', 400)
  const result = await nbaSharedCache(`admin-price-audit:v1:${game.id}:${nbaGameStart(game)}`, 60, 0, async () => {
    const key = process.env.ODDS_API_KEY?.trim()
    if (!key) throw new NbaPriceAuditError('configuration', 503)
    const [events, roster] = await Promise.all([getNbaFirstEvents(), getPaintRoster(game)])
    const match = nbaFirstEvent(events, game)
    const base = { provider: 'The Odds API', game: { id: game.id, date: game.date, homeTeam: game.home_team.full_name, awayTeam: game.visitor_team.full_name, commenceTime: new Date(nbaGameStart(game)!).toISOString() }, requestedBooks: [...BOOKS], requestedMarkets: [...MARKETS] }
    if (!nbaPriceAuditGameAllowed(game)) throw new NbaPriceAuditError('game', 400)
    if (!match) return { ...base, eventMatched: false, event: null, observedAt: new Date().toISOString(), quota: null, bookmakers: [] as AuditBook[], outcomes: 0 }
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(match.id)) throw new NbaPriceAuditError('payload')
    const url = new URL(`https://api.the-odds-api.com/v4/sports/basketball_nba/events/${encodeURIComponent(match.id)}/odds`)
    url.searchParams.set('apiKey', key)
    url.searchParams.set('bookmakers', BOOKS.join(','))
    url.searchParams.set('markets', MARKETS.join(','))
    url.searchParams.set('oddsFormat', 'american')
    const signal = AbortSignal.timeout(12_000)
    try {
      const response = await fetch(url, { cache: 'no-store', redirect: 'error', signal })
      if (!response.ok) {
        void response.body?.cancel().catch(() => {})
        throw new NbaPriceAuditError(response.status === 401 || response.status === 403 ? 'authorization' : response.status === 429 ? 'quota' : 'upstream')
      }
      const parsed = parseEvent(await boundedJson(response, signal), match, game, roster, Date.now())
      if (!nbaPriceAuditGameAllowed(game)) throw new NbaPriceAuditError('game', 400)
      return { ...base, eventMatched: true, ...parsed, observedAt: new Date().toISOString(), quota: { used: quotaCount(response, 'x-requests-used'), remaining: quotaCount(response, 'x-requests-remaining'), last: quotaCount(response, 'x-requests-last') } }
    } catch (error) {
      if (error instanceof NbaPriceAuditError) throw error
      // Fetch/JSON errors can contain the credential-bearing request URL.
      throw new NbaPriceAuditError('upstream')
    }
  }, 70)
  if (!nbaPriceAuditGameAllowed(game)) throw new NbaPriceAuditError('game', 400)
  return { ...result.value, fetchedAt: result.fetchedAt }
}
