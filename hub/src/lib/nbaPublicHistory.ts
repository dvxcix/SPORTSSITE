import { NBA_PUBLIC_MARKETS, type NbaPublicCapture, type NbaPublicRow } from './nbaPublic'
import type { NbaOddsMode } from './nbaOddsMode'

export const NBA_PUBLIC_CONTINUITY_VERSION = 1
export const NBA_PUBLIC_LEGACY_FRAMES = 64
export type NbaPublicStoredFrame = { captured_at: string; snapshot: NbaPublicCapture & { continuityVersion?: number; complete?: boolean; coverage?: Record<string, number> } }
export type NbaPublicView = {
  captured_at: string
  snapshot: Pick<NbaPublicCapture, 'gameId' | 'capturedAt' | 'rows' | 'markets' | 'normalizationVersion'> & { complete: boolean; coverage: Record<string, number> }
}
const markets = new Set<string>(NBA_PUBLIC_MARKETS.map(market => market.key))
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 10_000_000

/** Merge actual row observations; an unrelated capture never advances a row's
 * time or baseline. New composite snapshots already contain their own history. */
export function nbaPublicHistory(frames: NbaPublicStoredFrame[], gameId: number, mode: NbaOddsMode, tip: number, asOf: number): NbaPublicView[] {
  if (!Number.isFinite(tip) || !Number.isFinite(asOf)) return []
  const inPhase = (at: number) => Number.isFinite(at) && at <= asOf && (mode === 'pregame' ? at < tip : at >= tip)
  const valid = frames.filter(frame => frame.snapshot?.gameId === gameId && inPhase(Date.parse(frame.captured_at)))
    .sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at))
  const latest = valid.at(-1)
  if (!latest) return []
  const current = new Map<string, NbaPublicRow>()
  for (const frame of valid) {
    const frameAt = Date.parse(frame.captured_at)
    for (const row of Array.isArray(frame.snapshot.rows) ? frame.snapshot.rows : []) {
      if (!Number.isSafeInteger(row.playerId) || row.playerId <= 0 || !markets.has(row.market) || !count(row.picks)) continue
      const at = Date.parse(row.capturedAt ?? frame.captured_at)
      if (!inPhase(at) || at > frameAt) continue
      const key = `${row.playerId}:${row.market}`, prior = current.get(key)
      if (prior && Date.parse(prior.capturedAt!) >= at) continue
      const hasHistory = Object.hasOwn(row, 'previous')
      const previousAt = hasHistory ? Date.parse(row.previousAt ?? '') : Date.parse(prior?.capturedAt ?? '')
      const previous = hasHistory ? row.previous : prior?.picks
      const baseline = count(previous) && inPhase(previousAt) && previousAt < at
      current.set(key, {
        playerId: row.playerId, market: row.market, picks: row.picks,
        capturedAt: new Date(at).toISOString(),
        previous: baseline ? previous : null,
        previousAt: baseline ? new Date(previousAt).toISOString() : null,
        normalizationVersion: row.normalizationVersion ?? frame.snapshot.normalizationVersion,
      })
    }
  }
  const rows = [...current.values()].sort((a, b) => a.playerId - b.playerId || a.market.localeCompare(b.market))
  const coverage: Record<string, number> = {}
  for (const [key, value] of Object.entries(latest.snapshot.coverage ?? {})) {
    if (['observed', 'captured', 'empty', 'unavailable', 'deadline', 'normalized'].includes(key) && Number.isSafeInteger(value) && value >= 0) coverage[key] = value
  }
  return [{ captured_at: latest.captured_at, snapshot: {
    gameId, capturedAt: latest.captured_at, rows, markets: [...new Set(rows.map(row => row.market))],
    normalizationVersion: latest.snapshot.normalizationVersion,
    complete: latest.snapshot.complete === true, coverage,
  } }]
}
