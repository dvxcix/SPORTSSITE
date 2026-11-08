'use client'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { BookLogo } from '@/components/BookLogo'
import { SidelinePlayerAvatar } from './SidelinePlayerAvatar'
import { nflBoardIdentityKey,nflBoardImage,type NflBoardIdentity } from '@/lib/nflOddsBoardIdentity'
import { NFL_ODDS_BOARD_SCORER_MARKETS, nflOddsBoardMove, nflOddsBoardScorerLabel, type NflOddsBoardQuote } from '@/lib/nflOddsBoard'
import { nflBoardPickKey, nflUniqueBoardPicks, type NflBoardPick } from '@/lib/nflOddsBoardPicks'
import { nflOddsBoardTrust, type NflOddsBoardPhase } from '@/lib/nflOddsBoardTrust'
import styles from './nflOddsBoard.module.css'

type Quote=[string,number,string,string,string,string,string,number,number,string,number|null,string|null,number|null,boolean]
type Game={id:string;away:string;home:string;status:'ready'|'incomplete'|'unavailable'}
type TeamVisual=[gameId:string,abbr:string,primary:string,secondary:string,logo:string|null]
type Payload={date:string;games:Game[];markets:string[];books:string[];market:string;book:string;quotes:Quote[];picks?:NflBoardPick[];identities?:NflBoardIdentity[];teams?:TeamVisual[];phaseToken:string;phaseObservedAt:string;nextStart:string|null}
type Row={id:string;gameId:string;playerId:number;player:string;team:string;position:string;matchup:string;cells:Map<number,NflOddsBoardQuote>}
const price=(n:number|null)=>n==null?'—':n>0?`+${n}`:String(n)
const movement=(n:number)=>n===0?'0.00':`${n>0?'+':'−'}${Math.abs(n)<0.01?'<0.01':Math.abs(n).toFixed(2)}`
const label=(name:string)=>name.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()).replace(/\bTds?\b/g,'Touchdowns')
const unpack=(q:Quote):NflOddsBoardQuote=>({gameId:q[0],playerId:q[1],player:q[2],team:q[3],position:q[4],market:q[5],label:'',vendor:q[6],line:q[7],current:q[8],updatedAt:q[9],previous:q[10],previousAt:q[11],opening:q[12]??null,openingConflict:q[13]===true})

export function NflOddsBoard({date,phase=null,market,onMarket,vendor,onVendor}:{date:string;phase?:NflOddsBoardPhase|null;market:string;onMarket:(market:string)=>void;vendor:string;onVendor:(vendor:string)=>void}){
  const [game,setGame]=useState('all'),[team,setTeam]=useState('all'),[sort,setSort]=useState<'player'|'shortened'|'lengthened'>('shortened'),[sortLine,setSortLine]=useState('all'),[search,setSearch]=useState(''),[comparison,setComparison]=useState<'opening'|'earlier'>('opening')
  const requestKey=JSON.stringify([date,market,vendor])
  const [saved,setSaved]=useState<{key:string;value:Payload;receivedAt:number}|null>(null),[errorKey,setErrorKey]=useState<string|null>(null)
  const [openedAt]=useState(()=>Date.now()),[clock,setClock]=useState(()=>Date.now()),[requireAfter,setRequireAfter]=useState(0)
  const reload=useRef<()=>void>(()=>{}), scroll=useRef<HTMLDivElement|null>(null), scrollLeft=useRef(0), wasHidden=useRef(false)
  const raw=saved?.key===requestKey?saved.value:null
  const now=Math.max(clock,saved?.receivedAt??0,phase?.checkedAt??0)
  const trust=raw?nflOddsBoardTrust(raw,phase,openedAt,now,requireAfter):null
  const payload=trust?.safe?raw:null
  useEffect(()=>{
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>,pending=false,queued=false,nextStart:number|null=null,failures=0
    const load=async()=>{
      if(controller.signal.aborted)return
      if(pending){queued=true;return}
      if(document.visibilityState!=='visible'){timer=setTimeout(load,300000);return}
      pending=true
      try{
        const query=new URLSearchParams({date,market,book:vendor})
        const response=await fetch(`/api/the-sideline/odds-board?${query}`,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(115000)])})
        if(!response.ok)throw new Error('unavailable')
        const value=await response.json() as Payload
        if(value.date!==date||value.market!==market||value.book!==vendor||!Array.isArray(value.games)||!Array.isArray(value.markets)||!Array.isArray(value.books)||!Array.isArray(value.quotes)||value.quotes.length>5000||!value.phaseToken||!value.phaseObservedAt)throw new Error('invalid')
        if(value.nextStart!=null&&!Number.isFinite(Date.parse(value.nextStart)))throw new Error('invalid')
        if(!controller.signal.aborted){setSaved({key:requestKey,value,receivedAt:Date.now()});setErrorKey(null);failures=0;nextStart=value.nextStart?Date.parse(value.nextStart):null}
      }catch{if(!controller.signal.aborted){setErrorKey(requestKey);failures++}}
      finally{
        pending=false
        if(!controller.signal.aborted){
          if(queued&&document.visibilityState==='visible'){queued=false;queueMicrotask(()=>void load())}
          else {const delay=failures?Math.min(300000,30000*2**Math.min(failures-1,3))+Math.floor(Math.random()*10000):nextStart==null?null:Math.min(300000+Math.floor(Math.random()*15000),Math.max(250,nextStart-Date.now()+250));if(delay!=null)timer=setTimeout(load,delay)}
        }
      }
    }
    reload.current=()=>{clearTimeout(timer);void load()}
    void load()
    return()=>{controller.abort();clearTimeout(timer);reload.current=()=>{}}
  },[date,market,vendor,requestKey])
  useEffect(()=>{if(trust?.reason==='changed'&&phase?.token)reload.current()},[trust?.reason,phase?.token,phase?.observedAt])
  useEffect(()=>{
    const invalidate=()=>{const now=Date.now();flushSync(()=>{setClock(now);setRequireAfter(previous=>Math.max(previous,now))})}
    const visibility=()=>{if(document.visibilityState!=='visible'){wasHidden.current=true;return}if(wasHidden.current){wasHidden.current=false;invalidate()}}
    const pageShow=(event:PageTransitionEvent)=>{if(event.persisted)invalidate()}
    const offline=()=>invalidate(),online=()=>invalidate()
    document.addEventListener('visibilitychange',visibility);window.addEventListener('pageshow',pageShow);window.addEventListener('offline',offline);window.addEventListener('online',online)
    return()=>{document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pageshow',pageShow);window.removeEventListener('offline',offline);window.removeEventListener('online',online)}
  },[])
  useEffect(()=>{
    if(!trust?.safe)return
    const delay=trust.until-Date.now()
    if(delay<=0){const timer=setTimeout(()=>setClock(Date.now()),0);return()=>clearTimeout(timer)}
    const timer=setTimeout(()=>setClock(Date.now()),Math.min(delay+1,2147000000))
    return()=>clearTimeout(timer)
  },[trust?.safe,trust?.until])
  useLayoutEffect(()=>{if(payload&&scroll.current)scroll.current.scrollLeft=scrollLeft.current},[payload])
  const catalog=saved?.value.date===date?saved.value:null,shownMarket=payload?.market??market,shownBook=payload?.book??vendor
  const scorerLabel = nflOddsBoardScorerLabel(shownMarket)
  const marketOptions = [...new Set([market, ...Object.keys(NFL_ODDS_BOARD_SCORER_MARKETS), ...(catalog?.markets ?? [])])]
  const quotes=useMemo(()=>payload?.quotes.map(unpack)??[],[payload])
  const picks=useMemo(()=>new Map(nflUniqueBoardPicks(payload?.picks).map(row=>[nflBoardPickKey(row[0],row[1],row[2],row[3],row[4],row[5]),row])),[payload])
  const identities=useMemo(()=>new Map((Array.isArray(payload?.identities)?payload.identities:[]).filter(item=>Array.isArray(item)&&item.length===6&&typeof item[0]==='string'&&Number.isSafeInteger(item[1])&&typeof item[2]==='string'&&typeof item[3]==='string'&&Array.isArray(item[5])).map(item=>[nflBoardIdentityKey(item[0],item[1],item[3],item[2]),item])),[payload])
  const visuals=useMemo(()=>new Map((Array.isArray(payload?.teams)?payload.teams:[]).filter(item=>Array.isArray(item)&&item.length===5&&typeof item[0]==='string'&&typeof item[1]==='string').map(item=>[`${item[0]}:${item[1]}`,item])),[payload])
  const teams=useMemo(()=>[...new Set(quotes.filter(q=>game==='all'||q.gameId===game).map(q=>q.team))].sort(),[quotes,game])
  const filtered=useMemo(()=>quotes.filter(q=>(game==='all'||q.gameId===game)&&(team==='all'||q.team===team)&&q.player.toLowerCase().includes(search.trim().toLowerCase())),[quotes,game,team,search])
  const {rows,lines}=useMemo(()=>{
    const groups=new Map<string,Row>(),columns=new Set<number>()
    for(const q of filtered){
      const id=`${q.gameId}:${q.playerId}:${q.team}`,matchup=payload?.games.find(g=>g.id===q.gameId),row=groups.get(id)??{id,gameId:q.gameId,playerId:q.playerId,player:q.player,team:q.team,position:q.position,matchup:matchup?`${matchup.away} @ ${matchup.home}`:'',cells:new Map()}
      if(!row.cells.has(q.line)){row.cells.set(q.line,q);columns.add(q.line)}
      groups.set(id,row)
    }
    const all=[...groups.values()],selectedLine=columns.has(Number(sortLine))?sortLine:'all'
    const extreme=(row:Row)=>{const selected=selectedLine==='all'?[...row.cells.values()]:[row.cells.get(Number(selectedLine))].filter((q):q is NflOddsBoardQuote=>!!q);const values=selected.map(q=>nflOddsBoardMove(q.current,comparison==='opening'?q.opening:q.previous)).filter((x):x is number=>x!=null);return values.length?(sort==='lengthened'?Math.min(...values):Math.max(...values)):null}
    all.sort((a,b)=>{if(sort==='player')return a.player.localeCompare(b.player)||a.id.localeCompare(b.id);const x=extreme(a),y=extreme(b);return x==null||y==null?x==null&&y==null?a.player.localeCompare(b.player):x==null?1:-1:(sort==='lengthened'?x-y:y-x)||a.player.localeCompare(b.player)})
    return {rows:all,lines:[...columns].sort((a,b)=>a-b)}
  },[filtered,payload,sort,sortLine,comparison])
  const incomplete=payload?.games.filter(g=>g.status!=='ready')??[]
  const filterCount=Number(game!=='all')+Number(team!=='all')+Number(comparison!=='opening')+Number(sortLine!=='all'&&lines.some(line=>String(line)===sortLine))
  const playerCard=(row:Row)=>{
    const saved=identities.get(nflBoardIdentityKey(row.gameId,row.playerId,row.team,row.player)),visual=visuals.get(`${row.gameId}:${row.team}`)
    const color=(value:unknown,fallback:string)=>typeof value==='string'&&/^#[\da-f]{6}$/i.test(value)?value:fallback
    return <span className={styles.player}><SidelinePlayerAvatar player={{name:row.player,headshot:nflBoardImage(saved?.[4]),headshotFallbacks:(saved?.[5]??[]).map(nflBoardImage).filter((value):value is string=>!!value)}} team={{abbr:row.team,name:row.team,color:color(visual?.[2],'#1b2430'),color2:color(visual?.[3],'#111820'),logo:nflBoardImage(visual?.[4])}}/><span className={styles.playerText}><b>{row.player}</b><small>{row.team} · {row.position} · {row.matchup}</small></span></span>
  }
  return <section className={styles.panel} aria-label="NFL odds board">
    <header><h2>Odds Board</h2><span>Pregame</span></header>
    <div className={styles.controls}>
      <label>Market<select aria-label="Odds board market" value={shownMarket} onChange={e=>{onMarket(e.target.value);setSortLine('all')}}>{marketOptions.map(item=><option key={item} value={item}>{nflOddsBoardScorerLabel(item) ?? label(item)}</option>)}</select></label>
      <label>Sportsbook<span className={styles.book}><BookLogo vendor={shownBook||'fanduel'} size={20}/><select aria-label="Odds board sportsbook" value={shownBook} onChange={e=>{onVendor(e.target.value);setSortLine('all')}}>{[...new Set([vendor,...(payload?.books??[])])].map(item=><option key={item} value={item}>{label(item)}</option>)}</select></span></label>
      <label>Sort<select aria-label="Sort odds board" value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="shortened">Most shortened</option><option value="lengthened">Most lengthened</option><option value="player">Player A–Z</option></select></label>
      <label>Player<input aria-label="Find odds board player" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a player"/></label>
    </div>
    <details className={styles.options}>
      <summary>Filters{filterCount>0&&<span> · {filterCount} active</span>}</summary>
      <div className={styles.controls}>
      <label>Game<select aria-label="Odds board game" value={game} onChange={e=>{setGame(e.target.value);setTeam('all')}}><option value="all">All games</option>{payload?.games.map(g=><option key={g.id} value={g.id}>{g.away} @ {g.home}{g.status==='ready'?'':' · incomplete'}</option>)}</select></label>
      <label>Team<select aria-label="Odds board team" value={team} onChange={e=>setTeam(e.target.value)}><option value="all">All teams</option>{teams.map(t=><option key={t} value={t}>{t}</option>)}</select></label>
      <label>Compare<select aria-label="Compare odds to" value={comparison} onChange={e=>setComparison(e.target.value as typeof comparison)}><option value="opening">Opening</option><option value="earlier">Earlier</option></select></label>
      {!scorerLabel && <label>Sort milestone<select aria-label="Sort odds board milestone" value={lines.some(line=>String(line)===sortLine)?sortLine:'all'} onChange={e=>setSortLine(e.target.value)}><option value="all">Any milestone</option>{lines.map(line=><option key={line} value={line}>{line}+</option>)}</select></label>}
      </div>
    </details>
    {errorKey===requestKey&&<p role="status">{payload?'Latest update unavailable. Showing saved observations.':'Odds board unavailable.'}</p>}
    {!payload&&errorKey!==requestKey&&<p role="status">{raw?'Checking pregame prices…':'Loading saved odds…'}</p>}
    {!!incomplete.length&&<p role="status">Some saved prices unavailable: {incomplete.map(g=>`${g.away} @ ${g.home}`).join(', ')}.</p>}
    {!!rows.length&&<div ref={scroll} onScroll={event=>{scrollLeft.current=event.currentTarget.scrollLeft}} className={styles.scroll} role="region" aria-label={scorerLabel ? `${scorerLabel} odds and movement` : "NFL milestone odds and movement"} tabIndex={0}><table><thead><tr><th scope="col">Player</th>{lines.map(line=><th scope="col" key={line}>{scorerLabel ?? `${line}+`}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id}><th scope="row">{playerCard(row)}</th>{lines.map(line=>{const q=row.cells.get(line);if(!q)return <td key={line} className={styles.unknown}>—</td>;const baseline=comparison==='opening'?q.opening:q.previous,move=nflOddsBoardMove(q.current,baseline),count=picks.get(nflBoardPickKey(q.gameId,q.playerId,q.team,q.market,q.vendor,q.line));return <td key={line} className={move==null?styles.unknown:move>0?styles.shortenedCell:move<0?styles.lengthenedCell:styles.unchangedCell}><span className={styles.priceLine}><small>Last seen</small>{' '}<b>{price(q.current)}</b></span><span className={styles.priceLine}><small>{comparison==='opening'?'Open':'Earlier'}</small>{' '}<b>{price(baseline)}</b></span><span className={move==null?styles.muted:move>0?styles.shortened:move<0?styles.lengthened:styles.muted}>{move==null?'—':`${movement(move)} pp · ${move>0?'Shortened':move<0?'Lengthened':'Unchanged'}`}</span><small className={styles.picks}>{count?`${count[7]?'Est. ':''}${count[6].toLocaleString()} picks`:'Picks —'}</small></td>})}</tr>)}</tbody></table></div>}
    {payload&&!rows.length&&<p role="status">{scorerLabel ? `No saved ${scorerLabel.toLowerCase()} prices for these filters.` : 'No milestone prices for these filters.'}</p>}
  </section>
}
