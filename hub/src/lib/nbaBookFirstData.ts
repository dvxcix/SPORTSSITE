import 'server-only'
import { createAdminClient } from './supabase/admin'
import { nbaSharedCache } from './nbaSharedCache'
import { nbaGameStart, nbaPregameOpen, nbaQuoteInMode } from './nbaOddsMode'
import { nbaValidOdds } from './nbaOddsHistory'
import type { PaintGame, PaintProp } from './nbaPaint'

export const NBA_FIRST_BOOKS = ['draftkings', 'betmgm'] as const
export type NbaFirstBook = typeof NBA_FIRST_BOOKS[number]
export type NbaBookFirstFrame = { gameId: number; book: NbaFirstBook; tipoff: string; observedAt: string; props: PaintProp[]; complete: true }
export const nbaBookFirstKey = (game: PaintGame, book: NbaFirstBook) => `book-first:v1:${game.id}:${nbaGameStart(game)}:${book}`
const identity = (quote: PaintProp) => `${quote.game_id}:${quote.player_id}:${quote.vendor}:${quote.prop_type}:${quote.market.type}:${quote.line_value}:over`
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

export function nbaValidBookFirstFrame(value: unknown, game: PaintGame, book: NbaFirstBook): value is NbaBookFirstFrame {
  const start = nbaGameStart(game)
  if (start == null || !NBA_FIRST_BOOKS.includes(book)) return false
  if (!object(value) || value.gameId !== game.id || value.book !== book || value.complete !== true
    || value.tipoff !== new Date(start).toISOString() || typeof value.observedAt !== 'string'
    || !Number.isFinite(Date.parse(value.observedAt)) || Date.parse(value.observedAt) >= start || !Array.isArray(value.props) || value.props.length > 50) return false
  const seen = new Set<string>()
  return value.props.every((prop: unknown) => {
    if (!object(prop) || prop.game_id !== game.id || prop.vendor !== book || !Number.isSafeInteger(prop.player_id) || Number(prop.player_id) <= 0
      || prop.prop_type !== (book === 'draftkings' ? 'first_score' : 'first_field_goal') || prop.line_value !== '0.5'
      || prop.updated_at !== value.observedAt || !Number.isSafeInteger(prop.id) || !object(prop.market)
      || prop.market.type !== 'over_under' || !nbaValidOdds(prop.market.over_odds) || prop.market.under_odds != null || prop.market.odds != null
      || !nbaQuoteInMode(prop as PaintProp, game, 'pregame', Date.parse(value.observedAt as string))) return false
    const key = identity(prop as PaintProp)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Only the scheduled cloud collector writes these frames. Member reads never
 * open a browser. Failed inspections leave the previous observation untouched. */
export async function saveNbaBookFirstFrame(game: PaintGame, frame: NbaBookFirstFrame) {
  if (!nbaPregameOpen(game) || !nbaValidBookFirstFrame(frame, game, frame.book)
    || Date.parse(frame.observedAt) > Date.now() || Date.now() - Date.parse(frame.observedAt) > 300_000) throw new Error('NBA book observation unavailable')
  const { error } = await createAdminClient().from('nba_source_cache').upsert({
    key: nbaBookFirstKey(game, frame.book), payload: frame,
    fetched_at: frame.observedAt, expires_at: new Date(Date.parse(frame.observedAt) + 300_000).toISOString(),
    lease_token: null, lease_until: null,
  }, { onConflict: 'key' }).abortSignal(AbortSignal.timeout(12_000))
  if (error) throw new Error('NBA book observation could not be saved')
}

export function nbaBookFirstSupplement(game: PaintGame, primary: PaintProp[], entries: { key: string; payload: unknown }[], now = Date.now()) {
  if (!nbaPregameOpen(game, now)) return { props: [] as PaintProp[], complete: true }
  const present = new Set(primary.filter(prop => prop.market.type === 'over_under' && nbaValidOdds(prop.market.over_odds)
    && nbaQuoteInMode(prop, game, 'pregame', now)).map(identity))
  const props: PaintProp[] = []
  let complete = true
  for (const book of NBA_FIRST_BOOKS) {
    const row = entries.find(entry => entry.key === nbaBookFirstKey(game, book))
    if (!row) continue // The book has not yet produced a verified cloud frame.
    if (!nbaValidBookFirstFrame(row.payload, game, book)) { complete = false; continue }
    const missing = row.payload.props.filter(prop => !present.has(identity(prop)))
    const age = now - Date.parse(row.payload.observedAt)
    if (age < 0 || age > 300_000) {
      // An expired cloud-only price is not proof the sportsbook withdrew it.
      if (missing.length) complete = false
      continue
    }
    props.push(...missing)
  }
  return { props, complete }
}

export async function getNbaBookFirstSupplement(game: PaintGame, primary: PaintProp[], fresh = false) {
  if (!nbaPregameOpen(game)) return { props: [] as PaintProp[], complete: true }
  const read = async () => {
    const { data, error } = await createAdminClient().from('nba_source_cache').select('key,payload')
      .in('key', NBA_FIRST_BOOKS.map(book => nbaBookFirstKey(game, book))).abortSignal(AbortSignal.timeout(12_000))
    if (error || !Array.isArray(data)) throw new Error('NBA book observations unavailable')
    return data as { key: string; payload: unknown }[]
  }
  const entries = fresh ? await read() : (await nbaSharedCache(`book-first-read:v1:${game.id}:${nbaGameStart(game)}`, 10, 0, read, 25)).value
  return nbaBookFirstSupplement(game, primary, entries)
}
