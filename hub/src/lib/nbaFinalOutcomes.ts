import { nbaAppeared, nbaBinary, nbaCompactStat, nbaValue, type PaintGame, type PaintStat } from './nbaPaint'
import { nbaGameFinal, nbaGameStart } from './nbaOddsMode'

export type NbaFinalOutcome = { gameId: number; playerId: number; teamId: number; value: number }
export type NbaStoredFinalGame = { id:number;game_date:string;season:number;home_team_id:number;visitor_team_id:number;payload:PaintGame;fetched_at:string }
export type NbaStoredFinalStat = { id:number;game_id:number;player_id:number;team_id:number;game_date:string;season:number;period?:number;payload:PaintStat;fetched_at:string }

/** The durable game and the schedule must agree before showing a result. */
export function nbaVerifiedFinalGame(game:PaintGame, row:NbaStoredFinalGame, now = Date.now()) {
  const stored=row?.payload,seen=Date.parse(row?.fetched_at??''),starts=[nbaGameStart(game),stored?nbaGameStart(stored):null].filter((value):value is number=>value!=null)
  return !!stored && starts.length===2 && nbaGameFinal(game) && nbaGameFinal(stored) && Number.isFinite(seen) && seen<=now && seen>=Math.min(...starts)
    && row.id===game.id && stored.id===game.id && row.game_date===game.date && stored.date===game.date && row.season===game.season && stored.season===game.season
    && row.home_team_id===game.home_team.id && row.visitor_team_id===game.visitor_team.id && stored.home_team?.id===game.home_team.id && stored.visitor_team?.id===game.visitor_team.id
}

/** Only verified final rows can provide results. Missing rows, DNPs,
 * invalid player/game identities and duplicate player rows remain unknown. */
export function nbaFinalStats(game: PaintGame, rows: NbaStoredFinalStat[], period: number, now = Date.now()): PaintStat[] {
  const start=nbaGameStart(game)
  if (!nbaGameFinal(game) || start==null || !Array.isArray(rows) || rows.length > 160 || ![0,1].includes(period)) return []
  const counts = new Map<number, number>()
  for (const row of rows) if (Number.isSafeInteger(row?.player_id) && row.player_id > 0) counts.set(row.player_id, (counts.get(row.player_id) ?? 0) + 1)
  return rows.flatMap(row => {
    const stat=row?.payload,seen=Date.parse(row?.fetched_at??'')
    if (!stat || !Number.isSafeInteger(row.player_id) || row.player_id <= 0 || counts.get(row.player_id) !== 1 || row.id!==stat.id
      || row.game_id!==game.id || row.game_date!==game.date || row.season!==game.season || row.player_id!==stat.player?.id || row.team_id!==stat.team?.id
      || ![game.home_team.id,game.visitor_team.id].includes(row.team_id) || !Number.isFinite(seen) || seen<start || seen>now
      || stat.game?.id !== game.id || typeof stat.game.date !== 'string' || stat.game.date.slice(0,10) !== game.date
      || stat.game.home_team_id!==game.home_team.id || stat.game.visitor_team_id!==game.visitor_team.id
      || (stat.game.season!=null && stat.game.season!==game.season)
      || !(stat.game.status_state === 'final' || /^final\b/i.test(stat.game.status)) || (period===1 ? row.period!==1||stat.period!==1 : stat.period!=null&&stat.period!==0) || !nbaAppeared(stat)) return []
    return [nbaCompactStat({...stat,period})]
  })
}

export function nbaFinalOutcomes(game: PaintGame, rows: PaintStat[], market: string): NbaFinalOutcome[] {
  return rows.flatMap(row => {
    const value = nbaValue(row, market)
    return value == null ? [] : [{ gameId:game.id,playerId:row.player.id,teamId:row.team.id,value }]
  })
}

export function nbaFinalLabel(value:number, market:string) {
  return nbaBinary(market) ? value===1 ? 'Yes' : value===0 ? 'No' : null : String(value)
}

export function nbaFinalContractResult(value:number,market:string,line:number,type:string,side:'over'|'under') {
  if(!Number.isFinite(value)||!Number.isFinite(line))return null
  if(nbaBinary(market)){if(value!==0&&value!==1)return null;return (value===1)===(side==='over')?'Hit':'Miss'}
  if(type==='milestone')return side==='over'?(value>=line?'Hit':'Miss'):null
  if(type!=='over_under')return null
  if(value===line)return 'Push'
  return (side==='over'?value>line:value<line)?'Hit':'Miss'
}
