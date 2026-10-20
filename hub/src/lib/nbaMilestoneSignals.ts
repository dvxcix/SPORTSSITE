import { PAINT_MARKETS,nbaBinary,type PaintMarket } from './nbaPaint'
import { nbaValidOdds,type NbaQuoteOpeningRow } from './nbaOddsHistory'
import { impliedProbability } from './nbaMarketMetrics'
import type { PaintFrame } from './nbaMovement'
export type NbaMilestoneMove={key:string;gameId:number;playerId:number;book:string;market:PaintMarket;line:number;opening:number|null;current:number;change:number|null;firstAt:string|null;latestAt:string;openingKnown:boolean}
const key=(game:number,player:number,book:string,market:string,line:number)=>`${game}:${player}:${book}:${market}:${line}`
/** One quote, one threshold, one book, one side. Never synthesize movement by
 * switching a player's reference line or substituting another bookmaker. */
export function nbaMilestoneSignals(frames:PaintFrame[],openings:NbaQuoteOpeningRow[],gameId:number):NbaMilestoneMove[]{
  const ordered=frames.filter(f=>Number.isFinite(Date.parse(f.captured_at))).sort((a,b)=>Date.parse(a.captured_at)-Date.parse(b.captured_at)),latest=ordered.at(-1)
  if(!latest)return []
  const latestTime=Date.parse(latest.captured_at),first=new Map<string,{odds:number;at:string}>(),stored=new Map<string,NbaQuoteOpeningRow>()
  const valid=(p:PaintFrame['props'][number])=>p.game_id===gameId&&p.market.type==='milestone'&&!nbaBinary(p.prop_type)&&Number.isFinite(Number(p.line_value))&&Number(p.line_value)>0&&nbaValidOdds(p.market.odds)&&PAINT_MARKETS.some(m=>m.key===p.prop_type)
  for(const frame of ordered)for(const p of frame.props){if(!valid(p))continue;const k=key(gameId,p.player_id,p.vendor,p.prop_type,Number(p.line_value));if(!first.has(k))first.set(k,{odds:p.market.odds!,at:frame.captured_at})}
  for(const row of openings){
    if(row.game_id!==gameId||row.market_type!=='milestone'||row.side!=='over'||!nbaValidOdds(row.odds)||!Number.isFinite(Date.parse(row.observed_at))||Date.parse(row.observed_at)>latestTime)continue
    const k=key(gameId,row.player_id,row.vendor,row.market,Number(row.line)),prior=stored.get(k)
    if(!prior||Date.parse(row.observed_at)<Date.parse(prior.observed_at))stored.set(k,row)
  }
  const quotes=new Map<string,PaintFrame['props'][number]>()
  for(const p of latest.props){if(valid(p))quotes.set(key(gameId,p.player_id,p.vendor,p.prop_type,Number(p.line_value)),p)}
  return [...quotes].map(([k,p])=>{
    const captured=first.get(k),opening=stored.get(k),known=!!opening&&(!captured||Date.parse(opening.observed_at)<=Date.parse(captured.at)),baseline=known?{odds:opening.odds,at:opening.observed_at}:captured
    const comparable=!!baseline&&Date.parse(baseline.at)<latestTime
    return {key:k,gameId,playerId:p.player_id,book:p.vendor,market:p.prop_type as PaintMarket,line:Number(p.line_value),opening:baseline?.odds??null,current:p.market.odds!,change:comparable?(impliedProbability(p.market.odds)!-impliedProbability(baseline!.odds)!)*100:null,firstAt:baseline?.at??null,latestAt:latest.captured_at,openingKnown:known}
  })
}
export function nbaMilestonePeerRanks(moves:NbaMilestoneMove[],teams:Map<number,number>){
  const pools=new Map<string,NbaMilestoneMove[]>()
  for(const move of moves){const team=teams.get(move.playerId);if(team==null||move.change==null)continue;const k=`${move.gameId}:${team}:${move.book}:${move.market}:${move.line}`;pools.set(k,[...(pools.get(k)??[]),move])}
  const ranks=new Map<string,{shortened:number;lengthened:number;players:number}>()
  for(const pool of pools.values())for(const move of pool)ranks.set(move.key,{shortened:1+pool.filter(p=>p.change!>move.change!).length,lengthened:1+pool.filter(p=>p.change!<move.change!).length,players:pool.length})
  return ranks
}
export type NbaMoveSort='lengthened'|'shortened'|'absolute'|'name'
export function compareMilestoneMoves(a:NbaMilestoneMove,b:NbaMilestoneMove,sort:NbaMoveSort,names?:Map<number,string>){
  if(sort==='name')return (names?.get(a.playerId)??'').localeCompare(names?.get(b.playerId)??'')||a.line-b.line||a.key.localeCompare(b.key)
  if(a.change==null||b.change==null)return a.change==null?b.change==null?a.key.localeCompare(b.key):1:-1
  return (sort==='lengthened'?a.change-b.change:sort==='shortened'?b.change-a.change:Math.abs(b.change)-Math.abs(a.change))||a.key.localeCompare(b.key)
}
