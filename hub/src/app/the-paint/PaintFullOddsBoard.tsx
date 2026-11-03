'use client'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import Link from 'next/link'
import { bookName } from '@/components/BookLogo'
import { useNbaOddsMode } from '@/components/nba/NbaOddsModeContext'
import { nbaModeHref } from '@/lib/nbaModeHref'
import { nbaGameStart, nbaPregameOpen } from '@/lib/nbaOddsMode'
import { nbaBinary, nbaOdds, PAINT_MARKETS, type PaintGame, type PaintMarket } from '@/lib/nbaPaint'
import { nbaBoardMove,nbaBoardMoveLabel,nbaUnpackFullBoard, type NbaFullOddsBoard, type NbaPackedBoard } from '@/lib/nbaFullOddsBoard'
import { NBA_ODDS_BOARD_PHASE_MAX_AGE,nbaOddsBoardPhaseSignature,type NbaOddsBoardPhaseCheck } from '@/lib/nbaOddsBoardPhase'
import { PaintBookSelect } from './PaintEntitySelect'
import { TeamLogo } from './PaintVisuals'
import styles from './full-odds-board.module.css'

type Comparison='opening'|'previous'
function trackedGames(games:PaintGame[],learned:PaintGame[],now:number) {
  return games.map(item=>{const prior=learned.find(game=>game.id===item.id),starts=[nbaGameStart(item),prior?nbaGameStart(prior):null].filter((value):value is number=>value!=null);return {game:item,start:starts.length?Math.min(...starts):null,open:nbaPregameOpen(item,now)&&(!prior||nbaPregameOpen(prior,now))}})
}
const trackedSignature=(tracked:ReturnType<typeof trackedGames>)=>tracked.map(item=>`${item.game.id}:${item.start??'unknown'}:${item.open?'open':'closed'}`).sort().join('|')
export function PaintFullOddsBoard({date,games,phaseCheck=null,onResume,selectedMarket,selectedBook,onMarketChange,onBookChange}:{date:string;games:PaintGame[];phaseCheck?:NbaOddsBoardPhaseCheck|null;onResume?:(at:number)=>void;selectedMarket?:PaintMarket;selectedBook?:string;onMarketChange?:(market:PaintMarket)=>void;onBookChange?:(book:string)=>void}) {
  const mode=useNbaOddsMode(), [localMarket,setLocalMarket]=useState<PaintMarket>('points'), [localBook,setLocalBook]=useState('all'), [defaultBook,setDefaultBook]=useState('fanduel')
  const market=selectedMarket??localMarket, parentBook=selectedBook??localBook, book=parentBook==='all'?defaultBook:parentBook
  const setMarket=(value:PaintMarket)=>{setLocalMarket(value);onMarketChange?.(value)}, setBook=(value:string)=>{setLocalBook(value);onBookChange?.(value)}
  const supported=!nbaBinary(market)
  const [game,setGame]=useState('all'),[team,setTeam]=useState('all'),[sort,setSort]=useState('name'),[target,setTarget]=useState('all'),[query,setQuery]=useState(''),[comparison,setComparison]=useState<Comparison>('opening')
  const activeComparison:Comparison=comparison
  const [clock,setClock]=useState(()=>Date.now()),[data,setData]=useState<{key:string;value:NbaFullOddsBoard}|null>(null),[errorKey,setErrorKey]=useState<string|null>(null)
  const [resumeAfter,setResumeAfter]=useState(0)
  const pending=useRef<AbortSignal|null>(null),active=useRef<AbortController|null>(null),retryAfter=useRef<(()=>void)|null>(null),attempted=useRef(''),hidden=useRef(false),lastLoadedKey=useRef('')
  const scroll=useRef<HTMLDivElement|null>(null),scrollLeft=useRef(0)
  const scopedCheck=phaseCheck?.date===date&&phaseCheck.mode===mode?phaseCheck:null
  const now=Math.max(clock,scopedCheck?.receivedAt??0)
  // Include clocks returned by the phase-safe server, not just the page's
  // potentially older schedule. Never let a later clock reopen an early tip.
  const learned=data?.value.date===date?data.value.games:[]
  const tracked=trackedGames(games,learned,now)
  const signature=trackedSignature(tracked)
  const hasOpen=tracked.some(item=>item.open)
  const nextStart=tracked.map(item=>item.start).filter((start):start is number=>start!=null&&start>now).sort((a,b)=>a-b)[0]
  const key=`${date}:${mode}:${market}:${book}:${signature}`
  const candidate=data?.key===key?data.value:null,dataAt=candidate?.phaseCheckedAt??0,tokenAt=scopedCheck?.phase?.checkedAt??0
  const phaseFailed=!!scopedCheck&&!scopedCheck.phase&&scopedCheck.receivedAt>=dataAt
  const mismatch=!!candidate&&!!scopedCheck?.phase&&tokenAt>=dataAt&&nbaOddsBoardPhaseSignature(candidate.games)!==scopedCheck.phase.signature
  const verifiedAt=Math.max(dataAt,tokenAt),expired=!!candidate&&now-verifiedAt>NBA_ODDS_BOARD_PHASE_MAX_AGE
  // Returning from a background/offline page needs one successful later
  // phase check. The existing board poll supplies it; this adds no polling.
  const awaitingResume=resumeAfter>0&&dataAt<=resumeAfter&&(!scopedCheck?.phase||scopedCheck.phase.checkedAt<=resumeAfter)
  const phaseUnsafe=phaseFailed||mismatch||expired||awaitingResume
  const retryKey=mismatch&&scopedCheck?.phase?`${scopedCheck.receivedAt}:${scopedCheck.phase.signature}`:''
  useEffect(()=>{
    const check=()=>flushSync(()=>setClock(Date.now()))
    const resume=()=>{const at=Date.now();flushSync(()=>{setClock(at);setResumeAfter(at)});onResume?.(at)}
    const visibility=()=>{if(document.visibilityState==='hidden')hidden.current=true;else if(hidden.current){hidden.current=false;resume()}else check()}
    const pageShow=(event:PageTransitionEvent)=>{if(event.persisted)resume()}
    const timer=nextStart==null?null:window.setTimeout(check,Math.min(2_147_000_000,Math.max(1,nextStart-Date.now()+10)))
    window.addEventListener('focus',check);window.addEventListener('pageshow',pageShow);window.addEventListener('online',resume);window.addEventListener('offline',resume);document.addEventListener('visibilitychange',visibility)
    return()=>{if(timer!=null)window.clearTimeout(timer);window.removeEventListener('focus',check);window.removeEventListener('pageshow',pageShow);window.removeEventListener('online',resume);window.removeEventListener('offline',resume);document.removeEventListener('visibilitychange',visibility)}
  },[nextStart,now,onResume])
  useEffect(()=>{
    if(!candidate||verifiedAt<=0)return
    const delay=verifiedAt+NBA_ODDS_BOARD_PHASE_MAX_AGE+1-Date.now();if(delay<=0)return
    const timer=window.setTimeout(()=>flushSync(()=>setClock(Date.now())),delay)
    return()=>window.clearTimeout(timer)
  },[candidate,verifiedAt])
  const update=useCallback(async(signal:AbortSignal)=>{if(signal.aborted||pending.current===signal)return;pending.current=signal;try{
      const response=await fetch(nbaModeHref(`/the-paint/odds-board?${new URLSearchParams({date,market,book})}`,mode),{cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(115000)])})
      if(!response.ok)throw new Error('board')
      const value=nbaUnpackFullBoard(await response.json() as NbaPackedBoard,market)
      if(value.date!==date||value.selectedBook!==book||!Array.isArray(value.games)||!Array.isArray(value.players)||!Array.isArray(value.cells)||!Number.isSafeInteger(value.phaseCheckedAt)||value.phaseCheckedAt!>Date.now()+5000||Date.now()-value.phaseCheckedAt!>NBA_ODDS_BOARD_PHASE_MAX_AGE)throw new Error('identity')
      if(!signal.aborted){
        const responseAt=Date.now(),resultSignature=trackedSignature(trackedGames(games,value.games,responseAt)),resultKey=`${date}:${mode}:${market}:${book}:${resultSignature}`
        setClock(responseAt)
        // A response which crossed tip after its phase validation cannot stand
        // in for the final frozen board. The changed key triggers a fresh read.
        if(mode==='pregame'&&value.games.some(game=>{const start=nbaGameStart(game);return start!=null&&start>value.phaseCheckedAt!&&start<=responseAt}))throw new Error('phase changed')
        const availableBooks=value.books??[]
        if(parentBook==='all'&&availableBooks.length&&!availableBooks.includes(book)){setDefaultBook(availableBooks[0]);return}
        lastLoadedKey.current=resultKey;setData({key:resultKey,value});setErrorKey(null)
      }
    }catch{if(!signal.aborted)setErrorKey(key) }finally{if(pending.current===signal){pending.current=null;const retry=retryAfter.current;retryAfter.current=null;if(retry)queueMicrotask(retry)}}
  },[date,market,book,parentBook,mode,key,games])
  useEffect(()=>{
    const controller=new AbortController();active.current=controller;if(supported&&lastLoadedKey.current!==key)void update(controller.signal)
    // Fully closed pregame slates are immutable. Open/live users share one
    // bounded server cache rather than starting source requests per viewer.
    const timer=supported&&(mode==='live'||hasOpen)?window.setInterval(()=>{if(document.visibilityState==='visible')void update(controller.signal)},mode==='live'?60000:300000):null
    return()=>{controller.abort();if(active.current===controller)active.current=null;retryAfter.current=null;if(timer!=null)window.clearInterval(timer)}
  },[update,hasOpen,mode,key,supported])
  useEffect(()=>{
    if(!retryKey||!active.current||attempted.current===retryKey)return
    const signal=active.current.signal,run=()=>{if(signal.aborted)return;attempted.current=retryKey;void update(signal)}
    if(pending.current===signal)retryAfter.current=run;else run()
  },[retryKey,update])
  const slate=phaseUnsafe?null:candidate
  useLayoutEffect(()=>{
    const node=scroll.current;if(!slate||!node)return
    node.scrollLeft=scrollLeft.current
    return()=>{scrollLeft.current=node.scrollLeft}
  },[slate])
  const error=errorKey===key
  const books=useMemo(()=>slate?.books??[],[slate])
  const actualBook=slate?.selectedBook??book
  const filtered=useMemo(()=>(slate?.cells??[]).filter(cell=>cell.vendor===actualBook&&(game==='all'||String(cell.gameId)===game)),[slate,actualBook,game])
  const playerIndex=useMemo(()=>new Map((slate?.players??[]).map(player=>[`${player.gameId}:${player.id}`,player])),[slate])
  const teams=useMemo(()=>[...new Map((slate?.players??[]).map(player=>[player.team.id,player.team])).values()].sort((a,b)=>a.full_name.localeCompare(b.full_name)),[slate])
  const rows=useMemo(()=>{
    const groups=new Map<string,typeof filtered>()
    for(const cell of filtered){const id=`${cell.gameId}:${cell.playerId}`,player=playerIndex.get(id);if(!player||(team!=='all'&&String(player.team.id)!==team)||!`${player.first_name} ${player.last_name} ${player.team.full_name}`.toLowerCase().includes(query.toLowerCase()))continue;const group=groups.get(id)??[];group.push(cell);groups.set(id,group)}
    return [...groups].map(([id,cells])=>({id,player:playerIndex.get(id)!,cells})).sort((a,b)=>{
      if(sort!=='name'){
        const values=(row:typeof a)=>row.cells.filter(cell=>target==='all'||cell.line===Number(target)).map(cell=>nbaBoardMove(cell,activeComparison)).filter((value):value is number=>value!=null)
        const av=values(a),bv=values(b),x=av.length?(sort==='lengthened'?Math.min(...av):Math.max(...av)):null,y=bv.length?(sort==='lengthened'?Math.min(...bv):Math.max(...bv)):null
        if(x==null||y==null){if(x!==y)return x==null?1:-1}else if(x!==y)return sort==='lengthened'?x-y:y-x
      }
      return `${a.player.last_name} ${a.player.first_name}`.localeCompare(`${b.player.last_name} ${b.player.first_name}`)||a.player.gameId-b.player.gameId
    })
  },[filtered,playerIndex,team,query,sort,target,activeComparison])
  const columns=useMemo(()=>[...new Set(rows.flatMap(row=>row.cells.map(cell=>cell.line)))].sort((a,b)=>a-b),[rows])
  const unavailable=slate?.games.filter(item=>slate.failed.includes(item.id)||slate.unavailable.includes(item.id)).map(item=>`${item.visitor_team.abbreviation} @ ${item.home_team.abbreviation}`)??[]
  const firstUnavailable=slate?.games.filter(item=>slate.firstUnavailable?.includes(item.id)).map(item=>`${item.visitor_team.abbreviation} @ ${item.home_team.abbreviation}`)??[]
  const filterCount=Number(game!=='all')+Number(team!=='all')+Number(comparison!=='opening')+Number(target!=='all')
  const fmtTime=(value:string)=>new Date(value).toLocaleString('en-US',{timeZone:'America/New_York',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'})+' ET'
  return <section className={styles.board}>
    <h3>Odds Board</h3>
    <div className={styles.controlPanel}>
    <div className={styles.controls}>
      <label>Market<select aria-label="Odds board market" value={market} onChange={event=>{setMarket(event.target.value as PaintMarket);setTarget('all')}}>{nbaBinary(market)&&<option value={market}>{PAINT_MARKETS.find(item=>item.key===market)?.label??market} · unavailable</option>}{PAINT_MARKETS.filter(item=>!nbaBinary(item.key)).map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <div className={styles.control}><span>Sportsbook</span><div className={styles.bookSelect}><PaintBookSelect label="Odds board sportsbook" value={actualBook} onChange={setBook} books={books.length?books:[actualBook]} allowAll={false}/><span>{bookName(actualBook)}</span></div></div>
      <label>Sort<select aria-label="Sort odds board" value={sort} onChange={event=>setSort(event.target.value)}><option value="name">Player A–Z</option><option value="lengthened">Most lengthened</option><option value="shortened">Most shortened</option></select></label>
      <label>Player<input aria-label="Find player on odds board" placeholder="Player or team" value={query} onChange={event=>setQuery(event.target.value)}/></label>
    </div>
    <details className={styles.options}>
      <summary>Filters{filterCount>0&&<span> · {filterCount} active</span>}</summary>
      <div className={styles.controls}>
      <label>Game<select aria-label="Odds board game" value={game} onChange={event=>setGame(event.target.value)}><option value="all">All games</option>{(slate?.games??games).map(item=><option key={item.id} value={item.id}>{item.visitor_team.abbreviation} @ {item.home_team.abbreviation}</option>)}</select></label>
      <label>Team<select aria-label="Odds board team" value={team} onChange={event=>setTeam(event.target.value)}><option value="all">All teams</option>{teams.map(item=><option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label>
      <label>Compare<select aria-label="Compare odds to" value={comparison} onChange={event=>setComparison(event.target.value as Comparison)}><option value="opening">{mode==='live'?'First seen':'Opening'}</option><option value="previous">Earlier</option></select></label>
      <label>Sort milestone<select aria-label="Sort by milestone" value={target} onChange={event=>setTarget(event.target.value)}><option value="all">All milestones</option>{target!=='all'&&!columns.includes(Number(target))&&<option value={target}>{target}+ · not posted</option>}{columns.map(line=><option key={line} value={line}>{line}+</option>)}</select></label>
      </div>
    </details>
    </div>
    {supported&&(error||phaseUnsafe)&&<p role="status">{slate?'Last observed prices shown. ':''}{phaseUnsafe?'Game times unavailable.':'Odds board unavailable.'}</p>}
    {!supported?<p role="status">No milestone prices for this market.</p>:!slate?!error&&!phaseUnsafe&&<p role="status">Loading odds board…</p>:<>
      {(slate.stale||unavailable.length>0||(!slate.complete&&!firstUnavailable.length))&&<p role="status">{slate.stale?'Last observed prices shown. ':''}{unavailable.length?`Unavailable: ${unavailable.join(', ')}.`:!slate.complete&&!firstUnavailable.length?'Some games are unavailable.':''}</p>}
      {activeComparison==='opening'&&firstUnavailable.length>0&&<p role="status">{mode==='live'?'First seen':'Opening'} unavailable: {firstUnavailable.join(', ')}.</p>}
      <div ref={scroll} onScroll={event=>{scrollLeft.current=event.currentTarget.scrollLeft}} className={styles.scroll} role="region" aria-label="NBA milestone odds board" tabIndex={0}><table><thead><tr><th scope="col">Player</th>{columns.map(line=><th scope="col" key={line}>{line}+</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id}><th scope="row"><div className={styles.player}><TeamLogo abbr={row.player.team.abbreviation} size={24}/><span className={styles.playerText}><strong>{row.player.first_name} {row.player.last_name}</strong><small>{row.player.team.abbreviation}</small></span></div></th>{columns.map(line=>{const cell=row.cells.find(item=>item.line===line),base=cell?.[activeComparison],change=cell?nbaBoardMove(cell,activeComparison):null;return <td key={line} className={!cell||change==null?styles.unknown:change>0?styles.shortenedCell:change<0?styles.lengthenedCell:styles.unchangedCell}>{cell?<div className={styles.quote}><small>Last seen</small><Link prefetch={false} aria-label={`Analyze ${row.player.first_name} ${row.player.last_name} ${line}+ ${PAINT_MARKETS.find(item=>item.key===market)?.label ?? market}, ${bookName(cell.vendor)}, last seen ${nbaOdds(cell.current.odds)}`} href={nbaModeHref(`/the-paint?${new URLSearchParams({date,game:String(cell.gameId),player:String(cell.playerId),market,book:cell.vendor,side:'over',view:'research',panel:'ladder',line:String(line),type:'milestone',contract:'milestone',target:String(line)})}`,mode)}><strong>{nbaOdds(cell.current.odds)}</strong></Link><small>{activeComparison==='opening'?(mode==='live'?'First seen':'Open'):'Earlier'} {base?nbaOdds(base.odds):'—'}</small>{base&&<time dateTime={base.at}>{fmtTime(base.at)}</time>}<span className={change==null?styles.muted:change>0?styles.shorter:change<0?styles.longer:styles.muted}>{nbaBoardMoveLabel(change)}{change!=null&&<small> {change>0?'Shortened':change<0?'Lengthened':'Unchanged'}</small>}</span><time dateTime={cell.current.at}>{fmtTime(cell.current.at)}</time></div>:<span className={styles.muted}>—</span>}</td>})}</tr>)}</tbody></table></div>
      {!rows.length&&<p>No milestone prices for these filters.</p>}
    </>}
  </section>
}
