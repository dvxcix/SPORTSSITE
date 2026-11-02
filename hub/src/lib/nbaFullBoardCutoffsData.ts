import 'server-only'
import { createAdminClient } from './supabase/admin'
import { nbaGameStart } from './nbaOddsMode'
import type { PaintGame } from './nbaPaint'

/** Fresh, bounded, service-only checks of both durable phase clocks. */
export async function nbaFullBoardCutoffs(games:PaintGame[]):Promise<PaintGame[]> {
  if(games.length>16||new Set(games.map(game=>game.id)).size!==games.length||games.some(game=>!Number.isSafeInteger(game.id)||game.id<=0||nbaGameStart(game)==null))throw new Error('NBA phase unavailable')
  if(!games.length)return []
  const ids=games.map(game=>game.id),allowed=new Set(ids),admin=createAdminClient()
  const [phase,research]=await Promise.all([
    admin.from('nba_odds_phase_games').select('game_id,tipoff_at',{count:'exact'}).in('game_id',ids).limit(17).abortSignal(AbortSignal.timeout(12_000)),
    admin.from('nba_pregame_research').select('game_id,tipoff_at',{count:'exact'}).in('game_id',ids).limit(1000).abortSignal(AbortSignal.timeout(12_000)),
  ])
  if(phase.error||research.error||!Array.isArray(phase.data)||!Array.isArray(research.data)||phase.count!==phase.data.length||research.count!==research.data.length||phase.data.length>ids.length||research.data.length>=1000)throw new Error('NBA phase unavailable')
  const cutoffs=new Map(games.map(game=>[game.id,nbaGameStart(game)!]))
  for(const row of [...phase.data,...research.data]){
    const id=Number(row.game_id),at=Date.parse(row.tipoff_at)
    if(!allowed.has(id)||!Number.isFinite(at))throw new Error('NBA phase unavailable')
    cutoffs.set(id,Math.min(cutoffs.get(id)!,at))
  }
  return games.map(game=>({...game,datetime:new Date(cutoffs.get(game.id)!).toISOString()}))
}
