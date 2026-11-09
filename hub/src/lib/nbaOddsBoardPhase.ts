import { nbaGameFinal,nbaGameStart } from './nbaOddsMode'
import type { PaintGame } from './nbaPaint'

export type NbaOddsBoardPhase = { date:string; checkedAt:number; signature:string }
export type NbaOddsBoardPhaseCheck = { date:string; mode:'pregame'|'live'; phase:NbaOddsBoardPhase|null; receivedAt:number; expiresAt?:number|null; accessDenied?:boolean }
export const NBA_ODDS_BOARD_PHASE_MAX_AGE=81_000

/** Canonical slate identity plus the earliest resolved clock and started flag. */
export function nbaOddsBoardPhaseSignature(games:PaintGame[]):string|null {
  if(games.length>16)return null
  const seen=new Set<number>(), rows:string[]=[]
  for(const game of games){
    const start=nbaGameStart(game)
    if(!Number.isSafeInteger(game.id)||game.id<=0||start==null||!Number.isSafeInteger(start)||start<=0||seen.has(game.id))return null
    seen.add(game.id)
    const started=nbaGameFinal(game)||game.status_state==='in_progress'||Number(game.period)>0
    rows.push(`${game.id},${start},${started?1:0}`)
  }
  return rows.sort().join(';')
}
export function nbaOddsBoardPhaseHeader(phase:NbaOddsBoardPhase) { return `v1|${phase.date}|${phase.checkedAt}|${phase.signature}` }
export function nbaReadOddsBoardPhase(header:string|null,date:string,now:number):NbaOddsBoardPhase|null {
  if(!header||header.length>1200)return null
  const parts=header.split('|');if(parts.length!==4||parts[0]!=='v1'||parts[1]!==date||!/^\d{13}$/.test(parts[2]))return null
  const checkedAt=Number(parts[2]);if(!Number.isSafeInteger(checkedAt)||checkedAt>now+5000||now-checkedAt>NBA_ODDS_BOARD_PHASE_MAX_AGE)return null
  const entries=parts[3]?parts[3].split(';'):[];if(entries.length>16)return null
  const ids=new Set<number>()
  for(const entry of entries){
    if(!/^\d{1,10},\d{13},[01]$/.test(entry))return null
    const [id,start]=entry.split(',').map(Number);if(!Number.isSafeInteger(id)||id<=0||!Number.isSafeInteger(start)||ids.has(id))return null
    ids.add(id)
  }
  if(entries.join(';')!==[...entries].sort().join(';'))return null
  return {date,checkedAt,signature:parts[3]}
}

/** Resolve Live against the same shared, verified slate proof used by the
 * viewer. Never use a later cutoff than the current schedule supplied. */
export function nbaBoardPhaseGames(games:PaintGame[],phase:NbaOddsBoardPhase):PaintGame[] {
  const cutoffs=new Map(phase.signature?phase.signature.split(';').map(entry=>{const [id,start]=entry.split(',').map(Number);return [id,start] as const}):[])
  const resolved=games.map(game=>{
    const prior=nbaGameStart(game),start=cutoffs.get(game.id)
    if(prior==null||start==null||!Number.isSafeInteger(start)||start<=0||start>prior)throw new Error('Invalid NBA live slate')
    return {...game,datetime:new Date(start).toISOString()}
  })
  if(nbaOddsBoardPhaseSignature(resolved)!==phase.signature)throw new Error('NBA live slate changed')
  return resolved
}
