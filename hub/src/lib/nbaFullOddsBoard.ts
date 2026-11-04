import type { PaintGame, PaintProp, PaintRoster } from './nbaPaint'
import { nbaPrice } from './nbaPaint'
import { impliedProbability } from './nbaMarketMetrics'
import { nbaValidOdds, type NbaQuoteOpeningRow } from './nbaOddsHistory'

export type NbaBoardObservation = { odds:number; at:string }
export type NbaBoardCell = { gameId:number; playerId:number; vendor:string; market:string; line:number; current:NbaBoardObservation; opening:NbaBoardObservation|null; previous:NbaBoardObservation|null }
export type NbaBoardPlayer = Pick<PaintRoster,'id'|'first_name'|'last_name'|'position'|'team'> & { gameId:number; headshot?:string|null; publicPicks?:number|null }
export type NbaFullOddsBoard = { date:string; games:PaintGame[]; players:NbaBoardPlayer[]; cells:NbaBoardCell[]; failed:number[]; unavailable:number[]; firstUnavailable?:number[]; complete:boolean; stale?:boolean; books?:string[]; selectedBook?:string; phaseCheckedAt?:number }
/** Preserve sub-millisecond quote order; Date.parse alone truncates it. */
export function nbaTimestampNanoseconds(value:string):bigint|null {
  const match=/^(\d{4}-\d{2}-\d{2})[Tt ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}(?::?\d{2})?)$/i.exec(value)
  if(!match)return null
  const offset=match[4].length===3?`${match[4]}:00`:match[4],base=Date.parse(`${match[1]}T${match[2]}${offset}`)
  if(!Number.isFinite(base)||base<0)return null
  return BigInt(base)*BigInt(1_000_000)+BigInt((match[3]??'').padEnd(9,'0'))
}
/** A cached later cutoff is conservative for Live: an earlier correction may
 * expose more observations, but cannot make these already-live quotes pregame. */
export function nbaLiveBoardQuotes<T extends {updated_at:string}>(quotes:T[],frameAt:string,cutoff:string):T[] {
  const start=nbaTimestampNanoseconds(cutoff),frame=nbaTimestampNanoseconds(frameAt)
  if(start==null||frame==null||frame<start)throw new Error('Invalid live odds boundary')
  return quotes.filter(quote=>{const at=nbaTimestampNanoseconds(quote.updated_at);return at!=null&&at>=start&&at<=frame})
}
/** The database clock stores microseconds. A strict predecessor must not skip
 * another event in the same millisecond. Unknown formats have no prior. */
export function nbaBeforeCapture(value:string):string|null {
  const match=/\.(\d+)(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.exec(value)
  if(match&&match[1].length>6)return null
  const ns=nbaTimestampNanoseconds(value);if(ns==null||ns<BigInt(1000))return null
  const us=ns/BigInt(1000)-BigInt(1), seconds=us/BigInt(1_000_000), fraction=(us%BigInt(1_000_000)).toString().padStart(6,'0')
  return `${new Date(Number(seconds*BigInt(1000))).toISOString().slice(0,19)}.${fraction}Z`
}
type NbaPackedCell=[number,number,number,number,number,number|null,number|null,number|null,number|null]
type NbaPackedTime=[number,string]
export type NbaPackedBoard=Omit<NbaFullOddsBoard,'cells'|'books'> & {books:string[];identities:[number,number][];prefixes:string[];times:NbaPackedTime[];quotes:NbaPackedCell[]}

/** Dictionary-code repeated book and original timestamp strings, retaining the
 * source timestamps byte-for-byte. A single cache serves every book filter. */
export function nbaPackFullBoard(board:NbaFullOddsBoard):NbaPackedBoard {
  const books=[...new Set(board.cells.map(cell=>cell.vendor))].sort(),identities:[number,number][]=[],identityIndex=new Map<string,number>(),times:NbaPackedTime[]=[],prefixes:string[]=[],timeIndex=new Map<string,number>(),prefixIndex=new Map<string,number>(),bookIndex=new Map(books.map((book,index)=>[book,index]))
  const identity=(gameId:number,playerId:number)=>{const key=`${gameId}:${playerId}`,found=identityIndex.get(key);if(found!=null)return found;const index=identities.length;identities.push([gameId,playerId]);identityIndex.set(key,index);return index}
  const time=(value:string)=>{const found=timeIndex.get(value);if(found!=null)return found;const prefix=value.slice(0,11);let p=prefixIndex.get(prefix);if(p==null){p=prefixes.length;prefixes.push(prefix);prefixIndex.set(prefix,p)}const index=times.length;times.push([p,value.slice(11)]);timeIndex.set(value,index);return index}
  const quotes=board.cells.map((cell):NbaPackedCell=>[identity(cell.gameId,cell.playerId),bookIndex.get(cell.vendor)!,cell.line,cell.current.odds,time(cell.current.at),cell.opening?.odds??null,cell.opening?time(cell.opening.at):null,cell.previous?.odds??null,cell.previous?time(cell.previous.at):null])
  return {date:board.date,games:board.games,players:board.players,failed:board.failed,unavailable:board.unavailable,firstUnavailable:board.firstUnavailable,complete:board.complete,stale:board.stale,selectedBook:board.selectedBook,phaseCheckedAt:board.phaseCheckedAt,books,identities,prefixes,times,quotes}
}
/** Estimates are optional: if they push a valid board over its shared-cache
 * budget, keep the prices and report estimates unavailable. */
export function nbaPackFullBoardWithinLimit(board:NbaFullOddsBoard,maxBytes=1_048_576):NbaPackedBoard {
  const packed=nbaPackFullBoard(board)
  if(new TextEncoder().encode(JSON.stringify(packed)).byteLength<=maxBytes)return packed
  const players=board.players.map(player=>({...player,publicPicks:undefined}))
  return nbaPackFullBoard({...board,players})
}
/** Return one book without duplicating the cached slate or unrelated times. */
export function nbaSelectPackedBoard(board:NbaPackedBoard,book:string):NbaPackedBoard {
  const selected=book,index=board.books.indexOf(selected),times:NbaPackedTime[]=[],prefixes:string[]=[],seen=new Map<number,number>(),prefixSeen=new Map<number,number>()
  const time=(old:number|null)=>{if(old==null)return null;if(!Number.isSafeInteger(old)||old<0||old>=board.times.length)throw new Error('Invalid odds timestamp');const pair=board.times[old];if(!Array.isArray(pair)||!Number.isSafeInteger(pair[0])||pair[0]<0||pair[0]>=board.prefixes.length||typeof pair[1]!=='string')throw new Error('Invalid odds timestamp');const hit=seen.get(old);if(hit!=null)return hit;let prefix=prefixSeen.get(pair[0]);if(prefix==null){prefix=prefixes.length;prefixes.push(board.prefixes[pair[0]]);prefixSeen.set(pair[0],prefix)}const next=times.length;times.push([prefix,pair[1]]);seen.set(old,next);return next}
  const quotes=board.quotes.filter(row=>row[1]===index).map((row):NbaPackedCell=>[row[0],row[1],row[2],row[3],time(row[4])!,row[5],time(row[6]),row[7],time(row[8])])
  return {...board,selectedBook:selected,prefixes,times,quotes}
}
export function nbaUnpackFullBoard(board:NbaPackedBoard,market:string):NbaFullOddsBoard {
  if(!Array.isArray(board.books)||board.books.length>64||new Set(board.books).size!==board.books.length||board.books.some(book=>typeof book!=='string'||!/^[a-z0-9_]{1,30}$/.test(book))||!Array.isArray(board.identities)||board.identities.length>1024||!Array.isArray(board.prefixes)||board.prefixes.length>36000||!Array.isArray(board.times)||!Array.isArray(board.quotes)||board.quotes.length>12000||board.times.length>36000)throw new Error('Invalid odds board')
  const identities=new Set<string>()
  const observation=(odds:number|null,index:number|null):NbaBoardObservation|null=>{
    if(odds==null&&index==null)return null
    if(!nbaValidOdds(odds)||!Number.isSafeInteger(index)||index!<0||index!>=board.times.length)throw new Error('Invalid odds observation')
    const pair=board.times[index!]
    if(!Array.isArray(pair)||pair.length!==2||!Number.isSafeInteger(pair[0])||pair[0]<0||pair[0]>=board.prefixes.length||typeof board.prefixes[pair[0]]!=='string'||typeof pair[1]!=='string')throw new Error('Invalid odds observation')
    const at=board.prefixes[pair[0]]+pair[1];if(at.length>64||!Number.isFinite(Date.parse(at)))throw new Error('Invalid odds observation')
    return {odds,at}
  }
  const cells=board.quotes.map(row=>{
    if(!Array.isArray(row)||row.length!==9||!Number.isSafeInteger(row[0])||row[0]<0||row[0]>=board.identities.length||!Number.isSafeInteger(row[1])||row[1]<0||row[1]>=board.books.length||!Number.isFinite(row[2])||row[2]<0)throw new Error('Invalid odds contract')
    const pair=board.identities[row[0]];if(!Array.isArray(pair)||pair.length!==2||!Number.isSafeInteger(pair[0])||pair[0]<=0||!Number.isSafeInteger(pair[1])||pair[1]<=0)throw new Error('Invalid player identity')
    const identity=JSON.stringify([pair[0],pair[1],row[1],row[2]]);if(identities.has(identity))throw new Error('Duplicate odds contract');identities.add(identity)
    const current=observation(row[3],row[4]),opening=observation(row[5],row[6]),previous=observation(row[7],row[8]);if(!current)throw new Error('Invalid current odds')
    const at=nbaTimestampNanoseconds(current.at),openAt=opening&&nbaTimestampNanoseconds(opening.at),previousAt=previous&&nbaTimestampNanoseconds(previous.at)
    if(at==null||(opening&&(openAt==null||(openAt>=at&&opening.odds!==current.odds)))||(previous&&(previousAt==null||previousAt>=at)))throw new Error('Invalid odds chronology')
    return {gameId:pair[0],playerId:pair[1],vendor:board.books[row[1]],market,line:row[2],current,opening,previous}
  })
  if(board.firstUnavailable!=null&&(!Array.isArray(board.firstUnavailable)||board.firstUnavailable.length>16||board.firstUnavailable.some(id=>!Number.isSafeInteger(id)||id<=0)))throw new Error('Invalid unavailable games')
  return {date:board.date,games:board.games,players:board.players,failed:board.failed,unavailable:board.unavailable,firstUnavailable:board.firstUnavailable,complete:board.complete,stale:board.stale,selectedBook:board.selectedBook,phaseCheckedAt:board.phaseCheckedAt,books:board.books,cells}
}

/** Compare only the exact game/player/book/market/milestone/over contract. */
export function nbaFullBoardCells(gameId:number, market:string, current:PaintProp[], previous:PaintProp[], openings:NbaQuoteOpeningRow[], capturedAt?:string):NbaBoardCell[] {
  const key = (p:PaintProp) => JSON.stringify([p.game_id,p.player_id,p.vendor,p.prop_type,p.market.type,Number(p.line_value)])
  const usable = (p:PaintProp) => p.game_id===gameId && p.prop_type===market && p.market.type==='milestone' && p.vendor!=='' && String(p.line_value??'').trim()!=='' && Number.isFinite(Number(p.line_value)) && Number(p.line_value)>=0 && nbaValidOdds(nbaPrice(p)) && nbaTimestampNanoseconds(p.updated_at)!=null
  const byKey = (items:PaintProp[]) => {
    const result=new Map<string,PaintProp|null>()
    for(const item of items.filter(usable)) {
      const k=key(item), before=result.get(k)
      if(before===null)continue
      if(!before || nbaTimestampNanoseconds(item.updated_at)!>nbaTimestampNanoseconds(before.updated_at)!)result.set(k,item)
      else if(nbaTimestampNanoseconds(item.updated_at)===nbaTimestampNanoseconds(before.updated_at)&&nbaPrice(item)!==nbaPrice(before))result.set(k,null)
    }
    return result
  }
  const latest=byKey(current), prior=byKey(previous), result:NbaBoardCell[]=[]
  const openingIndex=new Map<string,NbaQuoteOpeningRow|null>()
  for(const row of openings){
    if(row.game_id!==gameId||row.market!==market||row.market_type!=='milestone'||row.side!=='over'||!row.vendor||!Number.isFinite(Number(row.line))||!nbaValidOdds(row.odds)||nbaTimestampNanoseconds(row.observed_at)==null)continue
    const k=JSON.stringify([row.game_id,row.player_id,row.vendor,row.market,row.market_type,Number(row.line)]),old=openingIndex.get(k)
    if(old===null)continue
    if(!old||nbaTimestampNanoseconds(row.observed_at)!<nbaTimestampNanoseconds(old.observed_at)!)openingIndex.set(k,row)
    else if(nbaTimestampNanoseconds(row.observed_at)===nbaTimestampNanoseconds(old.observed_at)&&row.odds!==old.odds)openingIndex.set(k,null)
  }
  for(const [k,quote] of latest) {
    if(!quote)continue
    const at=nbaTimestampNanoseconds(quote.updated_at)!, odds=nbaPrice(quote)!
    const capture=capturedAt?nbaTimestampNanoseconds(capturedAt):at,found=openingIndex.get(k),row=found&&capture!=null&&nbaTimestampNanoseconds(found.observed_at)!<=capture?found:null
    const old=prior.get(k), oldAt=old?nbaTimestampNanoseconds(old.updated_at):null
    if(old&&oldAt!=null&&(oldAt>at||oldAt===at&&nbaPrice(old)!==odds))continue
    const opening=row&&(nbaTimestampNanoseconds(row.observed_at)!<at||row.odds===odds)?{odds:row.odds,at:row.observed_at}:null
    result.push({gameId,playerId:quote.player_id,vendor:quote.vendor,market,line:Number(quote.line_value),current:{odds,at:quote.updated_at},opening,previous:old&&oldAt!=null&&oldAt<at?{odds:nbaPrice(old)!,at:old.updated_at}:null})
  }
  return result
}
export function nbaBoardMove(cell:NbaBoardCell, comparison:'opening'|'previous') {
  const baseline=cell[comparison], now=impliedProbability(cell.current.odds), before=baseline&&impliedProbability(baseline.odds)
  const first=baseline&&nbaTimestampNanoseconds(baseline.at),last=nbaTimestampNanoseconds(cell.current.at)
  if(!baseline||before==null||now==null||first==null||last==null||first>=last)return null
  return (now-before)*100
}
export function nbaBoardMoveLabel(move:number|null) {
  if(move==null||!Number.isFinite(move))return '—'
  if(move===0)return '0.0 pp'
  if(Math.abs(move)<0.05)return `${move>0?'+':'−'}<0.1 pp`
  return `${move>0?'+':'−'}${Math.abs(move).toFixed(1)} pp`
}
