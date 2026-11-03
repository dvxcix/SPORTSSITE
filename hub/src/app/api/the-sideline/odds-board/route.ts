import { NextRequest, NextResponse } from 'next/server'
import { requireNflAccess } from '@/lib/nflAccess'
import { createAdminClient } from '@/lib/supabase/admin'
import { nbaSharedCache } from '@/lib/nbaSharedCache'
import { nflOddsBoardQuotes, type NflOddsBoardFrame, type NflOddsBoardQuote } from '@/lib/nflOddsBoard'
import { getSidelineGames } from '@/app/the-sideline/data'
import { nflKickoffAt } from '@/app/the-sideline/kickoff'
import type { SidelineOddsBoard } from '@/lib/nflOddsTypes'
import { nflOddsBoardHash, nflOddsBoardSignature, readNflOddsBoardClocks, sharedNflOddsBoardClocks, type NflOddsBoardClock } from '@/lib/nflOddsBoardClock'

export const dynamic='force-dynamic'
export const maxDuration=120
type CompactQuote=[string,number,string,string,string,string,string,number,number,string,number|null,string|null,number|null,boolean]
type GameRow={id:string;away:string;home:string;status:'ready'|'incomplete'|'unavailable'}
type Pool={date:string;games:GameRow[];quotes:CompactQuote[]}
const tuple=(q:NflOddsBoardQuote):CompactQuote=>[q.gameId,q.playerId,q.player,q.team,q.position,q.market,q.vendor,q.line,q.current,q.updatedAt,q.previous,q.previousAt,q.opening,q.openingConflict]
const quoteKey=(q:CompactQuote)=>JSON.stringify([q[0],q[1],q[3],q[5],q[6],q[7]])

/** A partial view is separate from any verified baseline. Every carried
 * value retains its exact observation time and is labelled Last seen. */
function mergePartial(candidate:Pool, previous:Pool|null, clocks:NflOddsBoardClock[]):Pool {
  if(!previous)return candidate
  const games=new Map(candidate.games.map(game=>[game.id,game]))
  if(games.size!==candidate.games.length||previous.date!==candidate.date||!Array.isArray(previous.games)||!Array.isArray(previous.quotes)||previous.quotes.length>96000||previous.games.length!==candidate.games.length||new Set(previous.games.map(game=>game.id)).size!==previous.games.length||previous.games.some(game=>{const next=games.get(game.id);return !next||next.away!==game.away||next.home!==game.home}))throw new Error('Invalid saved odds board')
  const cutoff=new Map(clocks.map(clock=>[clock.id,clock.cutoff])), old=new Map<string,CompactQuote>()
  for(const raw of previous.quotes as unknown[]){
    // Version 3 contains the same genuine observations, without openings.
    // Retain that baseline during the versioned-cache rollout.
    const q=(Array.isArray(raw)&&raw.length===12?[...raw,null,false]:raw) as CompactQuote
    const stop=cutoff.get(q?.[0]),at=Date.parse(q?.[9]??'')
    if(!Array.isArray(q)||q.length!==14||!stop||!Number.isFinite(at)||at>=Date.parse(stop)||at>Date.now()||!Number.isSafeInteger(q[1])||q[1]<=0||typeof q[2]!=='string'||q[2].length>120||typeof q[3]!=='string'||q[3].length>12||![games.get(q[0])?.away,games.get(q[0])?.home].includes(q[3])||typeof q[4]!=='string'||q[4].length>12||typeof q[5]!=='string'||q[5].length>80||typeof q[6]!=='string'||q[6].length>40||!Number.isSafeInteger(q[7])||q[7]<=0||typeof q[8]!=='number'||!Number.isFinite(q[8])||Math.abs(q[8])<100||((q[10]==null)!==(q[11]==null))||(q[10]!=null&&(typeof q[10]!=='number'||!Number.isFinite(q[10])||Math.abs(q[10])<100||!q[11]||!Number.isFinite(Date.parse(q[11]))||Date.parse(q[11])>=at))||(q[12]!=null&&(typeof q[12]!=='number'||!Number.isFinite(q[12])||Math.abs(q[12])<100))||typeof q[13]!=='boolean'||(q[13]&&q[12]!=null))throw new Error('Invalid saved odds board')
    const key=quoteKey(q);if(old.has(key))throw new Error('Ambiguous saved odds board');old.set(key,q)
  }
  const output=new Map<string,CompactQuote>(), incomplete=new Set<string>()
  for(const q of candidate.quotes){
    const key=quoteKey(q), prior=old.get(key);old.delete(key)
    if(!prior){output.set(key,q);continue}
    const a=Date.parse(q[9]),b=Date.parse(prior[9])
    if(a===b&&q[8]!==prior[8]){
      const conflict=q[13]||prior[13]||(q[12]!=null&&prior[12]!=null&&q[12]!==prior[12])
      output.set(key,conflict?[...prior.slice(0,12),null,true] as CompactQuote:prior);incomplete.add(q[0]);continue
    }
    const latest=a>=b?q:prior, other=a>=b?prior:q, latestAt=Date.parse(latest[9])
    if(a<b)incomplete.add(q[0])
    const choices:Array<{value:number;at:string}> = []
    if(Date.parse(other[9])<latestAt)choices.push({value:other[8],at:other[9]})
    for(const item of [latest,other])if(item[10]!=null&&item[11]&&Number.isFinite(Date.parse(item[11]))&&Date.parse(item[11])<latestAt)choices.push({value:item[10],at:item[11]})
    choices.sort((x,y)=>Date.parse(y.at)-Date.parse(x.at))
    const prev=choices[0],ambiguous=prev&&choices.some(x=>x.at===prev.at&&x.value!==prev.value)
    const openings=[...new Set([latest[12],other[12]].filter((value):value is number=>value!=null))]
    const openingConflict=latest[13]||other[13]||openings.length>1
    if(openingConflict)incomplete.add(q[0])
    output.set(key,[...latest.slice(0,10),ambiguous?null:prev?.value??null,ambiguous?null:prev?.at??null,!openingConflict&&openings.length===1?openings[0]:null,openingConflict] as CompactQuote)
  }
  for(const [key,q] of old){output.set(key,q);incomplete.add(q[0])}
  const result:Pool={date:candidate.date,games:candidate.games.map(game=>incomplete.has(game.id)?{...game,status:'incomplete'}:game),quotes:[...output.values()]}
  if(Buffer.byteLength(JSON.stringify(result))>4*1024*1024)throw new Error('Odds board exceeds limit')
  return result
}

/** Only the exact fields the comparison needs are retained, with strict size
 * and clock bounds. A malformed/oversized frame is unavailable, never sliced. */
function compact(board:SidelineOddsBoard, capturedAt:string, cutoff:string, baseHistory=false):NflOddsBoardFrame|null {
  const at=Date.parse(capturedAt), stop=Date.parse(cutoff), now=Date.now()
  if(!Number.isFinite(at)||at>=stop||at>now||!Array.isArray(board?.players)||board.players.length>160)return null
  let count=0
  for(const player of board.players){
    if(!Number.isSafeInteger(player.id)||player.id<=0||typeof player.name!=='string'||player.name.length>120||typeof player.team!=='string'||player.team.length>12||typeof player.position!=='string'||player.position.length>12||!Array.isArray(player.markets)||player.markets.length>500)return null
    for(const market of player.markets){
      if(typeof market.key!=='string'||market.key.length>120||typeof market.propType!=='string'||market.propType.length>80||typeof market.label!=='string'||market.label.length>160||!Array.isArray(market.offers)||market.offers.length>32||market.offers.some(offer=>typeof offer.vendor!=='string'||offer.vendor.length>40))return null
      count+=market.offers.length;if(count>4000)return null
    }
  }
  const typedOpeningSource=baseHistory&&board.source==='live'&&!('fanduelParserVersion' in board)
  const players=board.players.flatMap(player=>{
    const markets=player.markets.flatMap(market=>{
      const offers=market.offers.filter(offer=>{const time=Date.parse(offer.updatedAt??''),odds=offer.current?.odds;return offer.type==='milestone'&&!offer.isOpeningOnly&&Number.isFinite(time)&&time<=at&&time<stop&&time<=now&&typeof odds==='number'&&Number.isFinite(odds)&&Math.abs(odds)>=100}).map(offer=>({vendor:offer.vendor,type:offer.type,line:offer.line,openingLine:typedOpeningSource?offer.openingLine:null,current:{odds:offer.current.odds},opening:typedOpeningSource?offer.opening:null,updatedAt:offer.updatedAt}))
      return offers.length?[{key:market.key,propType:market.propType,label:market.label,category:market.category,line:market.line,offers}]:[]
    })
    return markets.length?[{id:player.id,name:player.name,team:player.team,position:player.position,markets}]:[]
  })
  return {capturedAt,typedOpeningSource,board:{bdlGameId:board.bdlGameId,status:board.status,source:'snapshot',capturedAt,gameLines:[],players}}
}

export async function GET(request:NextRequest){
  const gate=await requireNflAccess();if(gate.error)return gate.error
  const params=request.nextUrl.searchParams, input=params.get('date'),requestedMarket=params.get('market')??'receiving_yards',requestedBook=params.get('book')??'fanduel'
  if(!input||!/^\d{4}-\d{2}-\d{2}$/.test(input)||!Number.isFinite(Date.parse(`${input}T00:00:00Z`))||new Date(`${input}T00:00:00Z`).toISOString().slice(0,10)!==input||!/^[a-z0-9_]{1,80}$/.test(requestedMarket)||!/^[a-z0-9_]{1,40}$/.test(requestedBook))return NextResponse.json({error:'Invalid odds board filters'},{status:400})
  try{
    const {games,date}=await getSidelineGames(input)
    if(date!==input||games.length>24||new Set(games.map(game=>game.id)).size!==games.length)throw new Error('Schedule unavailable')
    const {clocks}=await sharedNflOddsBoardClocks(date,games)
    const phase=nflOddsBoardSignature(clocks,Date.now())
    const candidate=await nbaSharedCache(`nfl:odds-board-candidate:v4:${date}:${nflOddsBoardHash(phase)}`,300,0,async()=>{
      const admin=createAdminClient(), capturedNow=new Date().toISOString()
      const entries:Array<{game:GameRow;quotes:CompactQuote[]}|null>=Array(games.length).fill(null)
      for(let offset=0;offset<games.length;offset+=3)await Promise.all(games.slice(offset,offset+3).map(async(game,relative)=>{
        const clock=clocks.find(item=>item.id===game.id), row:GameRow={id:game.id,away:game.away.abbr,home:game.home.abbr,status:'ready'}
        if(!clock?.cutoff){row.status='unavailable';entries[offset+relative]={game:row,quotes:[]};return}
        const cutoff=clock.cutoff
        const results=await Promise.all(['nfl_odds_snapshot_history','nfl_fanduel_capture_history'].map((table,index)=>admin.from(table).select(index===1?'board,captured_at,raw_tabs':'board,captured_at').eq('game_id',game.id).lt('captured_at',cutoff).lte('captured_at',capturedNow).order('captured_at',{ascending:false}).limit(2).abortSignal(AbortSignal.timeout(12000))))
        if(results.every(result=>result.error)){row.status='unavailable';entries[offset+relative]={game:row,quotes:[]};return}
        if(results.some(result=>result.error))row.status='incomplete'
        const sources=results.map((result,index)=>{
          if(result.error)return []
          const rows=(result.data??[]) as unknown as Array<{board:unknown;captured_at:string;raw_tabs?:unknown}>, version=(value:unknown)=>(value as {fanduelParserVersion?:number}|null)?.fanduelParserVersion
          if(!rows.length)row.status='incomplete'
          if(index===1&&rows.length&&version(rows[0].board)!==3){row.status='incomplete';return []}
          return rows.flatMap(item=>{
            if(index===1&&version(item.board)!==3){row.status='incomplete';return []}
            if(index===1){const tabs=(item as {raw_tabs?:unknown}).raw_tabs;if(!Array.isArray(tabs)||!tabs.length||tabs.length>32||Buffer.byteLength(JSON.stringify(tabs))>1024*1024||tabs.some(tab=>!tab||typeof tab!=='object'||tab.incomplete!==false))row.status='incomplete'}
            const frame=compact(item.board as SidelineOddsBoard,item.captured_at,cutoff,index===0)
            if(!frame){row.status='incomplete';return []}
            return [frame]
          })
        })
        if(!sources.some(source=>source.length))row.status='unavailable'
        const observations=nflOddsBoardQuotes(game.id,[game.away.abbr,game.home.abbr],cutoff,sources,Date.parse(capturedNow),true)
        if(observations.some(quote=>quote.openingConflict))row.status='incomplete'
        const quotes=observations.map(tuple)
        if(quotes.length>4000){row.status='unavailable';entries[offset+relative]={game:row,quotes:[]};return}
        entries[offset+relative]={game:row,quotes}
      }))
      const groups=entries.filter((entry):entry is NonNullable<typeof entry>=>entry!=null)
      // Keep games atomic: never silently truncate individual rungs. A game
      // that cannot fit is explicitly unavailable in this observation.
      let remaining=4*1024*1024-Buffer.byteLength(JSON.stringify({date,games:groups.map(entry=>entry.game),quotes:[]}))-4096
      for(const entry of groups){const bytes=Buffer.byteLength(JSON.stringify(entry.quotes));if(bytes>remaining){entry.game.status='unavailable';entry.quotes=[]}else remaining-=bytes}
      const pool:Pool={date,games:groups.map(entry=>entry.game),quotes:groups.flatMap(entry=>entry.quotes)}
      if(groups.length!==games.length||Buffer.byteLength(JSON.stringify(pool))>4*1024*1024)throw new Error('Odds board exceeds limit')
      return pool
    },110)
    const viewKey=`nfl:odds-board-partial-view:v4:${date}:${nflOddsBoardHash(phase)}`
    const priorViewKey=`nfl:odds-board-partial-view:v3:${date}:${nflOddsBoardHash(phase)}`
    // This namespace is intentionally separate from verified archive and
    // baseline data. An incomplete read never replaces or alters those rows.
    const view=await nbaSharedCache(viewKey,300,3600,async()=>{
      const admin=createAdminClient()
      const read=(key:string)=>admin.from('nba_source_cache').select('payload').eq('key',key).abortSignal(AbortSignal.timeout(10000)).maybeSingle()
      const current=await read(viewKey)
      if(current.error)throw new Error('Saved odds unavailable')
      let prior=current.data
      if(!prior){const legacy=await read(priorViewKey);if(legacy.error)throw new Error('Saved odds unavailable');prior=legacy.data}
      return mergePartial(candidate.value,(prior?.payload??null) as Pool|null,clocks)
    },110)
    // This is deliberately uncached: a newly corrected earlier kickoff or a
    // crossed boundary must invalidate the shared payload before it is sent.
    const phaseObservedAt=new Date().toISOString()
    const fresh=await readNflOddsBoardClocks(date,games)
    if(nflOddsBoardSignature(fresh,Date.now())!==phase)return NextResponse.json({error:'Odds board updating'},{status:503,headers:{'Cache-Control':'private, no-store'}})
    const pool=view.stale?{...view.value,games:view.value.games.map(game=>({...game,status:'incomplete' as const}))}:view.value
    if(pool.date!==date||pool.games.length!==games.length||pool.games.some(row=>!games.some(game=>game.id===row.id&&game.away.abbr===row.away&&game.home.abbr===row.home)||!['ready','incomplete','unavailable'].includes(row.status)))throw new Error('Invalid saved odds board')
    // Validate even cached values against the current exact game/cutoff set.
    mergePartial({date,games:pool.games,quotes:[]},pool,clocks)
    const markets=[...new Set(pool.quotes.map(q=>q[5]))].sort()
    const market=requestedMarket
    const books=[...new Set(pool.quotes.filter(q=>q[5]===market).map(q=>q[6]))].sort()
    const book=requestedBook
    const quotes=pool.quotes.filter(q=>q[5]===market&&q[6]===book)
    // An unavailable future game may acquire its first verified baseline;
    // its schedule is used only to decide when to poll, never to admit data.
    const future=fresh.flatMap(item=>{const game=games.find(candidate=>candidate.id===item.id);const time=item.cutoff?Date.parse(item.cutoff):game?nflKickoffAt(game)?.getTime():undefined;return time==null?[]:[time]}).filter(time=>time>Date.now())
    const response={date,games:pool.games,markets,books,market,book,quotes,phaseToken:nflOddsBoardHash(phase),phaseObservedAt,nextStart:future.length?new Date(Math.min(...future)).toISOString():null}
    if(Buffer.byteLength(JSON.stringify(response))>1024*1024)throw new Error('Odds board selection exceeds limit')
    return NextResponse.json(response,{headers:{'Cache-Control':'private, no-store'}})
  }catch{return NextResponse.json({error:'Odds board unavailable'},{status:503,headers:{'Cache-Control':'private, no-store'}})}
}
