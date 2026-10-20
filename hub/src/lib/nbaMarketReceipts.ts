import { NBA_PUBLIC_VERSION } from './nbaPublic'
import type { NbaOddsMode } from './nbaOddsMode'

export type NbaMarketReceipt = { status: 'captured' | 'unchanged' | 'failed' | 'deferred'; playerFingerprint?: string; playerObservedAt?: string }
export type NbaSourceReceipt = { key: string; payload: unknown; fetched_at: string | null }
const validTime = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))

/** Successful game-odds writes alone cannot verify an older player-price tape. */
export function nbaSuccessfulMarketReceipt(row: NbaSourceReceipt | undefined, gameId: number, fingerprint: string | null | undefined, mode: NbaOddsMode = 'pregame') {
  const payload = row?.payload as Partial<NbaMarketReceipt> | null
  const matchingKey = row?.key === `market-attempt:v4:${mode}:${gameId}` || mode === 'pregame' && row?.key === `market-attempt:v3:${gameId}`
  return matchingKey && row && payload && (payload.status === 'captured' || payload.status === 'unchanged') && fingerprint && payload.playerFingerprint === fingerprint && validTime(payload.playerObservedAt) && validTime(row.fetched_at) && Date.parse(payload.playerObservedAt) <= Date.parse(row.fetched_at) ? payload.playerObservedAt : null
}

export function nbaSuccessfulPublicReceipt(row: NbaSourceReceipt | undefined, gameId: number, fingerprint: string | null | undefined) {
  const payload = row?.payload as { changed?: unknown; players?: unknown; markets?: unknown; fingerprint?: unknown; observedAt?: unknown } | null
  return row?.key === `public-success:${NBA_PUBLIC_VERSION}:${gameId}` && payload && typeof payload.changed === 'boolean' && typeof payload.players === 'number' && payload.players > 0 && typeof payload.markets === 'number' && payload.markets > 0 && fingerprint && payload.fingerprint === fingerprint && validTime(payload.observedAt) && validTime(row.fetched_at) && Date.parse(payload.observedAt) <= Date.parse(row.fetched_at) ? payload.observedAt : null
}
