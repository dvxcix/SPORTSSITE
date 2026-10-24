import { NBA_PUBLIC_VERSION, normalizeNbaPublic, type NbaPublicCapture, type NbaPublicMarketState, type NbaPublicRow } from './nbaPublic'
import type { PaintGame, PaintRoster } from './nbaPaint'

export type NbaPublicPayload = { url: string; capturedAt: string; props: Record<string, Record<string, number>>; complete?: boolean; marketStates?: NbaPublicMarketState[] }
export type NbaPublicObservation = NbaPublicCapture & {
  continuityVersion: number; tipAt: string; complete: boolean; coverage: Record<string, number>
  rawCategories: { label: string; value: string; status: string; observedAt: string; rows: number; props: Record<string, number>; normalized: number; unmatched: number; valid: boolean }[]
}
/** Preserve each verified category independently. Unresolved or unsupported
 * categories remain in the private archive instead of disappearing silently. */
export function nbaPublicObservation(game: PaintGame, payload: NbaPublicPayload, roster: PaintRoster[], now = Date.now()): NbaPublicObservation {
  const captured = Date.parse(payload.capturedAt), tip = Date.parse(game.datetime ?? game.status)
  if (!/^https:\/\/app\.pikkit\.com\/event\/[a-z0-9-]+\/?$/i.test(payload.url)) throw new Error('Unverified event URL')
  if (!Number.isFinite(captured) || captured > now + 60000 || captured < now - 3600000 || !Number.isFinite(tip) || captured >= tip || now >= tip) throw new Error('Capture outside verified pregame window')
  if (!Array.isArray(payload.marketStates) || !payload.marketStates.length || payload.marketStates.length > 100 || !payload.props || typeof payload.props !== 'object' || Array.isArray(payload.props)) throw new Error('Verified market observations missing')
  if (JSON.stringify(payload).length > 2_000_000) throw new Error('NBA public observation too large')
  const coverage = { observed: payload.marketStates.length, captured: 0, empty: 0, unavailable: 0, deadline: 0, normalized: 0, unsupported: 0, unmatched: 0 }
  const rows = new Map<string, NbaPublicRow>(), seen = new Set<string>()
  const rawCategories: NbaPublicObservation['rawCategories'] = []
  let resolved = payload.complete === true
  for (const state of payload.marketStates) {
    const label = typeof state?.label === 'string' ? state.label.slice(0, 160) : '', value = typeof state?.value === 'string' ? state.value.slice(0, 160) : ''
    const observedAt = typeof state?.observedAt === 'string' ? state.observedAt : '', at = Date.parse(observedAt)
    const status = typeof state?.status === 'string' ? state.status : 'unavailable'
    let valid = !!label && !!value && !seen.has(value) && Number.isFinite(at) && at <= captured && at < tip && at >= now - 3600000
      && Number.isSafeInteger(state?.rows) && state.rows >= 0 && state.rows <= 10000 && ['captured', 'empty', 'unavailable', 'deadline'].includes(status)
    seen.add(value)
    if (['captured', 'empty', 'unavailable', 'deadline'].includes(status)) coverage[status as 'captured' | 'empty' | 'unavailable' | 'deadline']++
    const source = payload.props[label], raw: Record<string, number> = {}
    if (source && typeof source === 'object' && !Array.isArray(source)) for (const [name, picks] of Object.entries(source)) {
      if (name.length >= 3 && name.length <= 256 && Number.isSafeInteger(picks) && picks >= 0 && picks <= 10_000_000) raw[name] = picks
      else valid = false
    }
    if (state?.rows !== Object.keys(raw).length || status === 'captured' && !Object.keys(raw).length) valid = false
    if (status === 'empty' && (state?.rows !== 0 || Object.keys(raw).length)) valid = false
    // The extractor can verify some headers before a sibling/control fails.
    // Those props remain real observations even when the category is partial.
    const normalized = valid && Object.keys(raw).length ? normalizeNbaPublic({ [label]: raw }, roster) : { rows: [], unmatched: 0 }
    coverage.unmatched += normalized.unmatched
    if (valid && normalized.rows.length) coverage.normalized++
    if (valid && Object.keys(raw).length && !normalized.rows.length) coverage.unsupported++
    if (!valid || !['captured', 'empty'].includes(status) || status === 'captured' && (!normalized.rows.length || normalized.unmatched)) resolved = false
    for (const row of normalized.rows) {
      const key = `${row.playerId}:${row.market}`, prior = rows.get(key)
      if (!prior || Date.parse(prior.capturedAt!) <= at) rows.set(key, { ...row, capturedAt: new Date(at).toISOString(), normalizationVersion: NBA_PUBLIC_VERSION })
    }
    rawCategories.push({ label, value, status, observedAt, rows: Number.isSafeInteger(state?.rows) ? state.rows : 0, props: raw, normalized: normalized.rows.length, unmatched: normalized.unmatched, valid })
  }
  const observedRows = [...rows.values()].sort((a, b) => a.playerId - b.playerId || a.market.localeCompare(b.market))
  return {
    continuityVersion: 1, normalizationVersion: NBA_PUBLIC_VERSION, gameId: game.id, capturedAt: new Date(captured).toISOString(),
    tipAt: new Date(tip).toISOString(), sourceUrl: payload.url, rows: observedRows,
    markets: [...new Set(observedRows.map(row => row.market))], unmatched: coverage.unmatched,
    marketStates: payload.marketStates, complete: resolved, coverage, rawCategories,
  }
}
