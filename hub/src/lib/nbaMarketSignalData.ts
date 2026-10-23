import 'server-only'
import { createAdminClient } from './supabase/admin'
import { nbaSharedCache } from './nbaSharedCache'
import { getNbaAllMarketFrames, getNbaQuoteOpenings } from './nbaOddsHistoryData'
import { NBA_PUBLIC_VERSION, type NbaPublicCapture } from './nbaPublic'
import { nbaBuildMarketContext, nbaEmptyMarketContext, type NbaMarketContext } from './nbaMarketSignal'
import type { PaintGame } from './nbaPaint'
import { nbaSuccessfulMarketReceipt, nbaSuccessfulPublicReceipt, type NbaSourceReceipt } from './nbaMarketReceipts'
import { nbaGameStart, type NbaOddsMode } from './nbaOddsMode'
import { getNbaOddsGame } from './nbaOddsClockData'

/** Each phase reads its own quotes and baselines. Pregame freezes at tipoff. */
export async function getNbaMarketContext(game: Pick<PaintGame,'id'|'datetime'|'status'>, now = new Date().toISOString(), mode: NbaOddsMode = 'pregame'): Promise<NbaMarketContext> {
  const canonical = await getNbaOddsGame(game).catch(() => null)
  if (!canonical) return nbaEmptyMarketContext(game.id,now,null,'Game phase unavailable',mode)
  const tip = nbaGameStart(canonical), requested = Date.parse(now)
  const tipAt = tip != null ? new Date(tip).toISOString() : null
  const asOf = Number.isFinite(requested) && tip != null && mode === 'pregame' ? new Date(Math.min(requested,tip-1)).toISOString() : now
  const empty = (reason: string) => nbaEmptyMarketContext(game.id,asOf,tipAt,reason,mode)
  if (tip == null || !Number.isFinite(requested) || mode === 'live' && requested < tip) return empty(`A verified ${mode} cutoff is required`)
  try {
    const cached = await nbaSharedCache(`market-context:v3:${mode}:${game.id}:${tipAt}:${requested>=tip?'closed':'open'}`,60,0,async()=>{
      const admin = createAdminClient(), marketKey = `market-attempt:v4:${mode}:${game.id}`, legacyKey = `market-attempt:v3:${game.id}`, publicKey = `public-success:${NBA_PUBLIC_VERSION}:${game.id}`
      const [frames, openings, receipts] = await Promise.all([
        getNbaAllMarketFrames(game.id, mode, 'latest', asOf),
        getNbaQuoteOpenings(game.id, mode),
        admin.from('nba_source_cache').select('key,payload,fetched_at').in('key',[marketKey,publicKey,...(mode === 'pregame' ? [legacyKey] : [])]).abortSignal(AbortSignal.timeout(12_000)),
      ])
      if(receipts.error)throw new Error('NBA market context sources unavailable')
      const frame = frames.filter(frame => Date.parse(frame.captured_at) <= Date.parse(asOf)).at(-1) ?? null
      if (!frame) return empty(`No matching ${mode} price capture`)
      const checks = (receipts.data ?? []) as NbaSourceReceipt[]
      const fingerprint = (frame as typeof frame & {fingerprint?: string}).fingerprint
      const marketVerifiedAt = nbaSuccessfulMarketReceipt(checks.find(row=>row.key===marketKey),game.id,fingerprint,mode)
        ?? (mode === 'pregame' ? nbaSuccessfulMarketReceipt(checks.find(row=>row.key===legacyKey),game.id,fingerprint) : null)
      const verified = Date.parse(marketVerifiedAt ?? '')
      const marketCutoff = Number.isFinite(verified) && verified>=Date.parse(frame.captured_at) && verified<=Date.parse(asOf) ? marketVerifiedAt! : frame.captured_at
      let publicQuery = admin.from('nba_public_captures').select('snapshot,fingerprint').eq('game_id',game.id).lte('captured_at',marketCutoff)
      if (mode === 'live') publicQuery = publicQuery.gte('captured_at',tipAt!)
      const capturePublic = await publicQuery.order('captured_at',{ascending:false}).order('id',{ascending:false}).limit(1).abortSignal(AbortSignal.timeout(12_000))
      if(capturePublic.error)throw new Error('NBA public context unavailable')
      const publicVerifiedAt = nbaSuccessfulPublicReceipt(checks.find(row=>row.key===publicKey),game.id,capturePublic.data?.[0]?.fingerprint)
      return nbaBuildMarketContext({gameId:game.id,mode,asOf,tipAt,frame,openings,publicCapture:(capturePublic.data?.[0]?.snapshot??null) as NbaPublicCapture|null,marketVerifiedAt,publicVerifiedAt})
    },40)
    if(Date.parse(cached.value.asOf)>Date.parse(asOf))return empty('No verified market context at this earlier cutoff')
    return {...cached.value,asOf}
  } catch { return empty('Market context unavailable') }
}
