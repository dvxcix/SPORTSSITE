import { nbaPeriod, nbaPrice, PAINT_MARKETS, type PaintMarket, type PaintProp } from './nbaPaint'
import { nbaAttachOpenings, type NbaQuoteOpeningRow } from './nbaOddsHistory'
import { nbaOddsDelta } from './nbaOddsDelta'
import { nbaMovementReference, type PaintFrame } from './nbaMovement'
import { NBA_PUBLIC_VERSION, type NbaPublicCapture } from './nbaPublic'

export const NBA_MARKET_CONTEXT_VERSION = 'nba-market-context-v1'
export const NBA_MARKET_MAX_AGE_MS = 15 * 60_000
export const NBA_PUBLIC_MAX_AGE_MS = 90 * 60_000
export type NbaSignalQuote = { market: PaintMarket; type: PaintProp['market']['type']; line: number; side: 'over'; open: number; now: number; changePp: number; openedAt: string }
export type NbaMarketSignal = { playerId: number; book: string; target: NbaSignalQuote; related: NbaSignalQuote; targetPicks: number; relatedPicks: number; adjustment: number; opposingPicks: number; supportingMarkets: number; attenuation: number }
export type NbaMarketContext = { version: string; gameId: number; asOf: string; tipAt: string | null; marketCapturedAt: string | null; publicCapturedAt: string | null; marketObservedAt: string | null; publicObservedAt: string | null; available: boolean; reason: string | null; signals: NbaMarketSignal[] }
export type NbaMarketSupport = { adjustment: number; status: 'confirmed' | 'none' | 'unavailable' | 'under_unsupported' | 'quote_changed' | 'stale'; reason: string; signal: NbaMarketSignal | null; marketCapturedAt: string | null; publicCapturedAt: string | null; marketObservedAt: string | null; publicObservedAt: string | null }
export type NbaMarketInput = { offer: PaintProp; side: 'over' | 'under'; context: NbaMarketContext | null; asOf?: string }
export type NbaMarketSignalView = Omit<NbaMarketSignal,'adjustment'|'opposingPicks'|'supportingMarkets'|'attenuation'>
export type NbaMarketSupportView = Omit<NbaMarketSupport,'adjustment'|'signal'> & { signal: NbaMarketSignalView | null }
/** Customer-facing evidence contains observations, never internal scoring weights. */
export function nbaMarketSupportView(support: NbaMarketSupport): NbaMarketSupportView {
  const { status,reason,marketCapturedAt,publicCapturedAt,marketObservedAt,publicObservedAt } = support
  const signal = support.signal ? { playerId:support.signal.playerId,book:support.signal.book,target:support.signal.target,related:support.signal.related,targetPicks:support.signal.targetPicks,relatedPicks:support.signal.relatedPicks } : null
  return { status,reason,marketCapturedAt,publicCapturedAt,marketObservedAt,publicObservedAt,signal }
}
/** Poll verification times belong in provenance, not an economic dedupe key. */
export function nbaMarketSupportIdentity(support:NbaMarketSupport){
  return {adjustment:support.adjustment,status:support.status,reason:support.reason,signal:support.signal,marketCapturedAt:support.marketCapturedAt,publicCapturedAt:support.publicCapturedAt}
}
const clamp = (value: number) => Math.max(0, Math.min(1, value))
const time = (value: string | null | undefined) => value ? Date.parse(value) : NaN

/** Research hypotheses grouped by scoring/creation/rebounding, never all-market
 * Cartesian pairs. Defensive events/turnovers have no established mapping here.
 * Correlated components may corroborate a pair but can never stack adjustments. */
const related: Record<PaintMarket, readonly PaintMarket[]> = {
  points: ['threes','assists','rebounds','points_assists','points_rebounds','points_rebounds_assists'],
  threes: ['points','assists','points_assists'],
  rebounds: ['points','assists','double_double','rebounds_assists','points_rebounds','points_rebounds_assists'],
  assists: ['points','threes','rebounds','points_assists','rebounds_assists','points_rebounds_assists'],
  points_rebounds: ['points','rebounds','assists','points_rebounds_assists'],
  points_assists: ['points','assists','threes','points_rebounds_assists'],
  rebounds_assists: ['rebounds','assists','points','points_rebounds_assists'],
  points_rebounds_assists: ['points','rebounds','assists','points_rebounds','points_assists','rebounds_assists'],
  double_double: ['points','rebounds','assists','triple_double'],
  triple_double: ['points','rebounds','assists','double_double'],
  points_1q: ['rebounds_1q','assists_1q'], rebounds_1q: ['points_1q','assists_1q'], assists_1q: ['points_1q','rebounds_1q'],
  steals: [], blocks: [], turnovers: [],
}
const identity = (offer: PaintProp) => JSON.stringify([offer.game_id,offer.player_id,offer.vendor,offer.prop_type,offer.market.type,Number(offer.line_value)])
export function nbaEmptyMarketContext(gameId: number, asOf: string, tipAt: string | null, reason: string): NbaMarketContext {
  return { version: NBA_MARKET_CONTEXT_VERSION, gameId, asOf, tipAt, marketCapturedAt: null, publicCapturedAt: null, marketObservedAt: null, publicObservedAt: null, available: false, reason, signals: [] }
}
function observedAt(captured: string, receipt: string | null | undefined, cutoff: number) {
  const capturedTime = time(captured), verified = time(receipt)
  return Number.isFinite(verified) && verified >= capturedTime && verified <= cutoff ? receipt! : captured
}

/** Deterministic as-of research context. Counts are whole-category observations,
 * not dollars, bettor intent, sportsbook-specific picks or over-side allocation. */
export function nbaBuildMarketContext(input: { gameId: number; asOf: string; tipAt: string | null; frame: PaintFrame | null; openings: NbaQuoteOpeningRow[]; publicCapture: NbaPublicCapture | null; marketVerifiedAt?: string | null; publicVerifiedAt?: string | null }): NbaMarketContext {
  const { gameId, asOf, tipAt, frame, openings, publicCapture } = input
  const empty = nbaEmptyMarketContext(gameId, asOf, tipAt, 'Market context unavailable')
  const cutoff = time(asOf), tip = time(tipAt)
  if (!Number.isFinite(cutoff) || !Number.isFinite(tip) || cutoff >= tip) return { ...empty, reason: 'A verified pregame cutoff is required' }
  if (!frame || !Number.isFinite(time(frame.captured_at)) || time(frame.captured_at) > cutoff || frame.props.some(quote => quote.game_id !== gameId)) return { ...empty, reason: 'No matching pregame price capture' }
  const marketObservedAt = observedAt(frame.captured_at, input.marketVerifiedAt, cutoff)
  const marketBase = { ...empty, marketCapturedAt: frame.captured_at, marketObservedAt }
  if (cutoff - time(marketObservedAt) > NBA_MARKET_MAX_AGE_MS) return { ...marketBase, reason: 'Price observations are stale' }
  if (!publicCapture || publicCapture.gameId !== gameId || publicCapture.normalizationVersion !== NBA_PUBLIC_VERSION || !Number.isFinite(time(publicCapture.capturedAt)) || time(publicCapture.capturedAt) > time(marketObservedAt)) return { ...marketBase, reason: 'No verified public snapshot at the price cutoff' }
  const publicObservedAt = observedAt(publicCapture.capturedAt, input.publicVerifiedAt, time(marketObservedAt))
  const base = { ...marketBase, publicCapturedAt: publicCapture.capturedAt, publicObservedAt }
  if (cutoff - time(publicObservedAt) > NBA_PUBLIC_MAX_AGE_MS) return { ...base, reason: 'Public observations are stale' }
  const counts = new Map<string, number | null>()
  for (const row of publicCapture.rows) {
    if (!Number.isSafeInteger(row.picks) || row.picks < 0 || row.picks > 10_000_000) continue
    const key = `${row.playerId}:${row.market}`
    counts.set(key, counts.has(key) && counts.get(key) !== row.picks ? null : row.picks)
  }
  const candidates = nbaAttachOpenings(gameId, frame.props, [], openings).props
  const unique = new Map<string, PaintProp | null>()
  for (const quote of candidates) {
    const key = identity(quote), prior = unique.get(key)
    if (!unique.has(key)) unique.set(key, quote)
    else if (!prior || nbaPrice(prior) !== nbaPrice(quote) || nbaPrice(prior,'under') !== nbaPrice(quote,'under')) unique.set(key,null)
  }
  const quotes = [...unique.values()].filter((quote): quote is PaintProp => quote != null)
  const quoteSignal = (offer: PaintProp): NbaSignalQuote | null => {
    const market = PAINT_MARKETS.find(market => market.key === offer.prop_type)?.key, opening = offer.opening?.over, now = nbaPrice(offer), movement = nbaOddsDelta(opening?.odds, now)
    if (!market || !opening || !movement || now == null || time(opening.at) >= time(frame.captured_at) || !Number.isFinite(Number(offer.line_value))) return null
    return { market, type: offer.market.type, line: Number(offer.line_value), side: 'over', open: opening.odds, now, changePp: movement.pp, openedAt: opening.at }
  }
  const signals = quotes.flatMap(offer => {
    const target = quoteSignal(offer), targetPicks = counts.get(`${offer.player_id}:${offer.prop_type}`)
    if (!target || target.changePp > -.25 || targetPicks == null || !related[target.market].length) return []
    const own = quotes.filter(quote => quote.player_id === offer.player_id && quote.vendor === offer.vendor)
    const relations = related[target.market].flatMap(market => {
      if (nbaPeriod(market) !== nbaPeriod(target.market)) return []
      const reference = nbaMovementReference(own, market, offer.vendor, 'over'), quote = reference ? quoteSignal(reference) : null, picks = counts.get(`${offer.player_id}:${market}`)
      if (!quote || picks == null || picks - targetPicks < 10 || picks + targetPicks < 20) return []
      return [{ quote, picks }]
    })
    const supporting = relations.filter(row => row.quote.changePp >= .25), opposingPicks = Math.max(0,...relations.filter(row => row.quote.changePp <= -.25).map(row=>row.picks))
    const pairs = supporting.map(row => {
      // Use the strongest conflicting observation, never summed correlated
      // categories. Adding another supporting category cannot stack a boost.
      const total = row.picks + targetPicks, share = row.picks/total, attenuation=row.picks/(row.picks+opposingPicks)
      const adjustment = Math.round(8 * clamp(Math.min(-target.changePp,row.quote.changePp)/5) * clamp((share-.5)/.35) * clamp(total/100) * attenuation * 10)/10
      return { playerId: offer.player_id, book: offer.vendor, target, related: row.quote, targetPicks, relatedPicks: row.picks, adjustment, opposingPicks, supportingMarkets: supporting.length, attenuation } satisfies NbaMarketSignal
    }).filter(row => row.adjustment > 0).sort((a,b) => b.adjustment-a.adjustment || b.relatedPicks-a.relatedPicks || a.related.market.localeCompare(b.related.market))
    return pairs.length ? [pairs[0]] : []
  })
  return { ...base, available: true, reason: null, signals }
}

/** The quote on screen must equal the quote that earned the adjustment. */
export function nbaMarketSupport(input?: NbaMarketInput): NbaMarketSupport {
  const context = input?.context
  const neutral: NbaMarketSupport = { adjustment: 0, status: 'unavailable', reason: context?.reason ?? 'Market context unavailable', signal: null, marketCapturedAt: context?.marketCapturedAt ?? null, publicCapturedAt: context?.publicCapturedAt ?? null, marketObservedAt: context?.marketObservedAt ?? null, publicObservedAt: context?.publicObservedAt ?? null }
  if (input?.side === 'under') return { ...neutral, status: 'under_unsupported', reason: 'Category counts do not identify under-side interest' }
  if (!input || !context?.available || context.version !== NBA_MARKET_CONTEXT_VERSION || context.gameId !== input.offer.game_id) return neutral
  const cutoff = time(input.asOf ?? context.asOf), tip = time(context.tipAt)
  if (![cutoff,tip,time(context.asOf),time(context.marketObservedAt),time(context.publicObservedAt)].every(Number.isFinite) || cutoff < time(context.asOf) || cutoff >= tip || time(context.marketObservedAt) > cutoff || time(context.publicObservedAt) > time(context.marketObservedAt) || cutoff-time(context.marketObservedAt)>NBA_MARKET_MAX_AGE_MS || cutoff-time(context.publicObservedAt)>NBA_PUBLIC_MAX_AGE_MS) return { ...neutral, status: 'stale', reason: 'Market context is outside the verified pregame window' }
  const matches = context.signals.filter(signal => signal.playerId === input.offer.player_id && signal.book === input.offer.vendor && signal.target.market === input.offer.prop_type && signal.target.type === input.offer.market.type && signal.target.line === Number(input.offer.line_value) && signal.target.side === input.side)
  const signal = matches.find(signal => signal.target.now === nbaPrice(input.offer,input.side))
  if (!signal) return { ...neutral, status: matches.length ? 'quote_changed' : 'none', reason: matches.length ? 'The selected price changed; awaiting a matching capture' : 'No confirmed paired market signal' }
  return { ...neutral, status: 'confirmed', reason: 'Target price lengthened while a related market shortened with more category picks', adjustment: Math.max(0,Math.min(8,signal.adjustment)), signal }
}

/** Discovery spans the selected player's market, including other lines/books.
 * It never changes the exact-quote support used by the score calculation. */
export function nbaPlayerMarketSignals(input: { playerId: number; gameId: number; market: PaintMarket; book: string; side: 'over' | 'under'; props: PaintProp[]; context: NbaMarketContext | null; asOf?: string }): NbaMarketSupport {
  const own = input.props.filter(offer => offer.game_id === input.gameId && offer.player_id === input.playerId)
  const offers = own.filter(offer => offer.prop_type === input.market && (input.book === 'all' || offer.vendor === input.book) && nbaPrice(offer, input.side) != null)
  if (!offers.length) return { ...nbaMarketSupport(), reason: 'No market quote available' }
  const baseline = nbaMarketSupport({ offer: offers[0], side: input.side, context: input.context, asOf: input.asOf })
  if (['unavailable', 'stale', 'under_unsupported'].includes(baseline.status)) return baseline
  const candidates = input.context!.signals.filter(signal => signal.playerId === input.playerId && signal.target.market === input.market && (input.book === 'all' || signal.book === input.book))
  const currentQuote = (signal: NbaMarketSignal, quote: NbaSignalQuote) => {
    const matches = own.filter(offer => offer.vendor === signal.book && offer.prop_type === quote.market && offer.market.type === quote.type && Number(offer.line_value) === quote.line)
    return matches.length && matches.every(offer => nbaPrice(offer, 'over') === quote.now) ? matches[0] : null
  }
  const confirmed = candidates.flatMap(signal => {
    const target = currentQuote(signal, signal.target), related = currentQuote(signal, signal.related)
    if (!target || !related) return []
    const support = nbaMarketSupport({ offer: target, side: input.side, context: input.context, asOf: input.asOf })
    return support.status === 'confirmed' ? [support] : []
  }).sort((a,b) => b.adjustment - a.adjustment || b.signal!.relatedPicks - a.signal!.relatedPicks || a.signal!.book.localeCompare(b.signal!.book) || a.signal!.target.line - b.signal!.target.line)
  if (confirmed.length) return confirmed[0]
  return { ...baseline, adjustment: 0, signal: null, status: candidates.length ? 'quote_changed' : 'none', reason: candidates.length ? 'Prices changed; awaiting a matching capture' : 'No confirmed paired market signal' }
}
