import 'server-only'
import { createAdminClient } from './supabase/admin'
import { nbaSharedCache } from './nbaSharedCache'
import type { NbaPublicCapture } from './nbaPublic'
import { getPaintGame } from './nbaPaintData'
import { nbaGameStart, type NbaOddsMode } from './nbaOddsMode'
import type { PaintGame } from './nbaPaint'
import { getNbaOddsGame } from './nbaOddsClockData'

type PublicSnapshot = Pick<NbaPublicCapture, 'gameId' | 'capturedAt' | 'rows' | 'markets'>
export async function getNbaPublicCaptures(gameId: number, mode: NbaOddsMode = 'pregame', game?: Pick<PaintGame,'id'|'datetime'|'status'>) {
  const match = game ? await getNbaOddsGame(game) : await getPaintGame(gameId), tip = nbaGameStart(match)
  if (match.id !== gameId || tip == null || mode === 'live' && Date.now() < tip) return []
  const phaseEnd = mode === 'pregame' ? Math.min(Date.now(), tip - 1) : Date.now()
  return (await nbaSharedCache(`public-captures:v2:${mode}:${gameId}:${tip}:${phaseEnd >= tip - 1 ? 'closed' : 'open'}`, 60, 0, async () => {
    let query = createAdminClient().from('nba_public_captures').select('snapshot,captured_at').eq('game_id',gameId).lte('captured_at',new Date(phaseEnd).toISOString())
    if (mode === 'live') query = query.gte('captured_at',new Date(tip).toISOString())
    const { data, error } = await query.order('captured_at',{ascending:false}).limit(2).abortSignal(AbortSignal.timeout(12000))
    if (error) throw new Error('Public activity unavailable')
    return (data ?? []).map(({snapshot,captured_at}) => ({
      captured_at: captured_at as string,
      snapshot: { gameId: snapshot.gameId, capturedAt: snapshot.capturedAt, rows: snapshot.rows, markets: snapshot.markets } as PublicSnapshot,
    }))
  }, 25)).value
}
