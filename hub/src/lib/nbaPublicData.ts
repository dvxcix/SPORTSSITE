import 'server-only'
import { createAdminClient } from './supabase/admin'
import { nbaSharedCache } from './nbaSharedCache'
import type { NbaPublicCapture } from './nbaPublic'

type PublicSnapshot = Pick<NbaPublicCapture, 'gameId' | 'capturedAt' | 'rows' | 'markets'>
export async function getNbaPublicCaptures(gameId: number) {
  return (await nbaSharedCache(`public-captures:v1:${gameId}`, 60, 0, async () => {
    const { data, error } = await createAdminClient().from('nba_public_captures').select('snapshot,captured_at').eq('game_id',gameId).order('captured_at',{ascending:false}).limit(2).abortSignal(AbortSignal.timeout(12000))
    if (error) throw new Error('Public activity unavailable')
    return (data ?? []).map(({snapshot,captured_at}) => ({
      captured_at: captured_at as string,
      snapshot: { gameId: snapshot.gameId, capturedAt: snapshot.capturedAt, rows: snapshot.rows, markets: snapshot.markets } as PublicSnapshot,
    }))
  }, 25)).value
}
