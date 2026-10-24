import 'server-only'
import { createAdminClient } from './supabase/admin'
import { nbaSharedCache } from './nbaSharedCache'
import { nbaPublicHistory, NBA_PUBLIC_CONTINUITY_VERSION, NBA_PUBLIC_LEGACY_FRAMES, type NbaPublicStoredFrame } from './nbaPublicHistory'
import { getPaintGame } from './nbaPaintData'
import { nbaGameStart, type NbaOddsMode } from './nbaOddsMode'
import type { PaintGame } from './nbaPaint'
import { getNbaOddsGame } from './nbaOddsClockData'

export async function getNbaPublicCaptures(gameId: number, mode: NbaOddsMode = 'pregame', game?: Pick<PaintGame,'id'|'datetime'|'status'>) {
  const match = game ? await getNbaOddsGame(game) : await getPaintGame(gameId), tip = nbaGameStart(match)
  if (match.id !== gameId || tip == null || mode === 'live' && Date.now() < tip) return []
  const phaseEnd = mode === 'pregame' ? Math.min(Date.now(), tip - 1) : Date.now()
  return (await nbaSharedCache(`public-captures:v3:${mode}:${gameId}:${tip}:${phaseEnd >= tip - 1 ? 'closed' : 'open'}`, 60, 0, async () => {
    const read = async (limit: number) => {
      let query = createAdminClient().from('nba_public_captures').select('snapshot,captured_at').eq('game_id',gameId).lte('captured_at',new Date(phaseEnd).toISOString())
      if (mode === 'live') query = query.gte('captured_at',new Date(tip).toISOString())
      const { data, error } = await query.order('captured_at',{ascending:false}).order('id',{ascending:false}).limit(limit).abortSignal(AbortSignal.timeout(12000))
      if (error) throw new Error('Public activity unavailable')
      return (data ?? []) as NbaPublicStoredFrame[]
    }
    const latest = await read(1)
    const frames = latest.length && latest[0].snapshot.continuityVersion !== NBA_PUBLIC_CONTINUITY_VERSION ? await read(NBA_PUBLIC_LEGACY_FRAMES) : latest
    return nbaPublicHistory(frames, gameId, mode, tip, phaseEnd)
  }, 25)).value
}
