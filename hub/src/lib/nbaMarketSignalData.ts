import 'server-only'
import { createAdminClient } from './supabase/admin'
import { nbaSharedCache } from './nbaSharedCache'
import { getNbaQuoteOpenings } from './nbaOddsHistoryData'
import { NBA_PUBLIC_VERSION, type NbaPublicCapture } from './nbaPublic'
import { nbaBuildMarketContext, nbaEmptyMarketContext, type NbaMarketContext } from './nbaMarketSignal'
import type { PaintFrame } from './nbaMovement'
import type { PaintGame } from './nbaPaint'
import { nbaSuccessfulMarketReceipt, nbaSuccessfulPublicReceipt, type NbaSourceReceipt } from './nbaMarketReceipts'

/** One shared read per game, including all exact contracts; no source fetches or
 * per-player DB requests. A historical board freezes at the last pregame instant. */
export async function getNbaMarketContext(game: Pick<PaintGame,'id'|'datetime'|'status'>, now = new Date().toISOString()): Promise<NbaMarketContext> {
  const tip = Date.parse(game.datetime ?? game.status), requested = Date.parse(now)
  const tipAt = Number.isFinite(tip) ? new Date(tip).toISOString() : null
  const asOf = Number.isFinite(requested) && Number.isFinite(tip) ? new Date(Math.min(requested,tip-1)).toISOString() : now
  if (!Number.isFinite(tip) || !Number.isFinite(requested)) return nbaEmptyMarketContext(game.id,asOf,tipAt,'A verified pregame cutoff is required')
  try {
    const cached = await nbaSharedCache(`market-context:v1:${game.id}:${tipAt}:${requested>=tip?'pregame':'live'}`,60,0,async()=>{
      const admin = createAdminClient(), marketKey = `market-attempt:v3:${game.id}`, publicKey = `public-success:${NBA_PUBLIC_VERSION}:${game.id}`
      const [capture, openings, receipts] = await Promise.all([
        admin.from('nba_market_captures').select('fingerprint,captured_at,props').eq('game_id',game.id).lte('captured_at',asOf).order('captured_at',{ascending:false}).order('id',{ascending:false}).limit(1).abortSignal(AbortSignal.timeout(12_000)),
        getNbaQuoteOpenings(game.id),
        admin.from('nba_source_cache').select('key,payload,fetched_at').in('key',[marketKey,publicKey]).abortSignal(AbortSignal.timeout(12_000)),
      ])
      if(capture.error||receipts.error)throw new Error('NBA market context sources unavailable')
      const frame = (capture.data?.[0] ?? null) as (PaintFrame & {fingerprint:string}) | null
      if (!frame) return nbaEmptyMarketContext(game.id,asOf,tipAt,'No matching pregame price capture')
      const checks = (receipts.data ?? []) as NbaSourceReceipt[]
      const marketVerifiedAt = nbaSuccessfulMarketReceipt(checks.find(row=>row.key===marketKey),game.id,frame.fingerprint)
      // Only successful exact-game receipts at or before this as-of cut can
      // verify unchanged economics. Failed/deferred attempts never freshen them.
      const verified = Date.parse(marketVerifiedAt ?? '')
      const marketCutoff = Number.isFinite(verified) && verified>=Date.parse(frame.captured_at) && verified<=Date.parse(asOf) ? marketVerifiedAt! : frame.captured_at
      const capturePublic = await admin.from('nba_public_captures').select('snapshot,fingerprint').eq('game_id',game.id).lte('captured_at',marketCutoff).order('captured_at',{ascending:false}).order('id',{ascending:false}).limit(1).abortSignal(AbortSignal.timeout(12_000))
      if(capturePublic.error)throw new Error('NBA public context unavailable')
      const publicVerifiedAt = nbaSuccessfulPublicReceipt(checks.find(row=>row.key===publicKey),game.id,capturePublic.data?.[0]?.fingerprint)
      return nbaBuildMarketContext({gameId:game.id,asOf,tipAt,frame,openings,publicCapture:(capturePublic.data?.[0]?.snapshot??null) as NbaPublicCapture|null,marketVerifiedAt,publicVerifiedAt})
    },40)
    // An explicitly requested earlier as-of must never receive a newer cached
    // research context. Historical cache keys are frozen before tipoff.
    if(Date.parse(cached.value.asOf)>Date.parse(asOf))return nbaEmptyMarketContext(game.id,asOf,tipAt,'No verified market context at this earlier cutoff')
    return {...cached.value,asOf}
  } catch { return nbaEmptyMarketContext(game.id,asOf,tipAt,'Market context unavailable') }
}
