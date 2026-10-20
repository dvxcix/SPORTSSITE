'use client'
import { useEffect, useMemo, useState } from 'react'
import type { FirstBasketRow } from '@/lib/nbaFirstBasketOdds'
import { NBA_FIRST_MARKETS } from '@/lib/nbaFirstBasketMarkets'
import { nbaPrice } from '@/lib/nbaPaint'
import { impliedProbability } from '@/lib/nbaMarketMetrics'
import { watchNbaRefresh } from '@/lib/nbaRefresh'
import { BookLogo, bookName } from '@/components/BookLogo'
import { PaintPickActions } from './PaintPickActions'
import { PaintPriceValue } from './PaintPrice'
import { PlayerAvatar } from './PaintVisuals'
import styles from './paint.module.css'

type Slate = {date:string;requestedDate:string;games:number;loaded:number;failed:number;status:string;unmatched:number;rows:FirstBasketRow[];fetchedAt:string}
type QuoteGroup = {key:string;row:FirstBasketRow;quotes:FirstBasketRow[]}
const groupKey = (row:FirstBasketRow) => `${row.game.id}:${row.player.id}:${row.offer.prop_type}:${row.offer.market.type}:${row.offer.line_value}`
const playerName = (row:FirstBasketRow) => `${row.player.last_name} ${row.player.first_name}`
const time = (at:string) => new Date(at).toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'})
const bestProbability = (group:QuoteGroup) => Math.min(...group.quotes.map(row=>impliedProbability(nbaPrice(row.offer))??Infinity))

export function PaintFirstBasketOdds({date}:{date:string}) {
  const [state,setState]=useState<Slate|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0)
  const [game,setGame]=useState('all'),[team,setTeam]=useState('all'),[market,setMarket]=useState('all'),[book,setBook]=useState('all'),[query,setQuery]=useState('')
  const [sort,setSort]=useState('movement'),[direction,setDirection]=useState('all'),[basis,setBasis]=useState('opening'),[minimum,setMinimum]=useState(0)
  useEffect(()=>{
    const controller=new AbortController();let pending=false
    const update=async()=>{
      if(pending)return;pending=true
      try {
        const response=await fetch(`/the-paint/first-basket/odds?date=${date}`,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(115000)])})
        if(!response.ok)throw new Error('unavailable')
        const data=await response.json() as Slate
        if(!controller.signal.aborted){setState(data);setError('')}
      } catch {if(!controller.signal.aborted)setError('First-basket prices could not refresh.')} finally {pending=false}
    }
    void update();const stop=watchNbaRefresh(update);return()=>{controller.abort();stop()}
  },[date,retry])
  const slate=state?.requestedDate===date?state:null
  const catalog=useMemo(()=>{
    const rows=slate?.rows??[]
    return {books:[...new Set(rows.map(row=>row.offer.vendor))].sort(),games:[...new Map(rows.map(row=>[row.game.id,row.game])).values()],teams:[...new Map(rows.filter(row=>game==='all'||String(row.game.id)===game).map(row=>[row.player.team.id,row.player.team])).values()]}
  },[slate,game])
  const groups=useMemo(()=>{
    const pool=new Map<string,QuoteGroup>()
    for(const row of slate?.rows??[]){
      if(game!=='all'&&String(row.game.id)!==game||team!=='all'&&String(row.player.team.id)!==team||market!=='all'&&row.offer.prop_type!==market||book!=='all'&&row.offer.vendor!==book||!`${row.player.first_name} ${row.player.last_name}`.toLowerCase().includes(query.trim().toLowerCase()))continue
      const key=groupKey(row),group=pool.get(key)??{key,row,quotes:[]};group.quotes.push(row);pool.set(key,group)
    }
    const change=(row:FirstBasketRow)=>basis==='previous'?row.movement?.previousChange:row.movement?.change
    const matches=(row:FirstBasketRow)=>{
      const value=change(row)
      if(value==null)return direction==='all'&&minimum===0||direction==='untracked'
      if(direction==='untracked'||Math.abs(value)<minimum)return false
      return direction==='all'||direction==='shortened'&&value>0||direction==='lengthened'&&value<0||direction==='unchanged'&&value===0
    }
    const movement=(group:QuoteGroup)=>{
      const values=group.quotes.filter(matches).map(change).filter((value):value is number=>value!=null)
      return !values.length?null:sort==='lengthened'?Math.min(...values):sort==='shortened'?Math.max(...values):Math.max(...values.map(Math.abs))
    }
    return [...pool.values()].filter(group=>group.quotes.some(matches)).sort((a,b)=>{
      let order=0
      if(sort==='name')order=playerName(a.row).localeCompare(playerName(b.row))
      else if(sort==='game')order=Date.parse(a.row.game.datetime??a.row.game.status)-Date.parse(b.row.game.datetime??b.row.game.status)
      else if(sort==='price'||sort==='shortest')order=(bestProbability(a)-bestProbability(b))*(sort==='price'?1:-1)
      else {const av=movement(a),bv=movement(b);order=av==null?bv==null?0:1:bv==null?-1:(av-bv)*(sort==='lengthened'?1:-1)}
      return order||playerName(a.row).localeCompare(playerName(b.row))||a.key.localeCompare(b.key)
    })
  },[slate,game,team,market,book,query,basis,direction,minimum,sort])
  const vendors=book==='all'?catalog.books:[book]
  return <section aria-label="First-basket slate odds" className={`${styles.movement} ${styles.firstBasketOdds}`}>
    <div className={styles.sectionHeading}><h3>First-basket odds · NBA slate</h3><button className={styles.filterToggle} onClick={()=>setRetry(n=>n+1)}>Refresh prices</button></div>
    <div className={styles.movementTools}>
      <label>Game<select aria-label="First-basket game" value={game} onChange={event=>{setGame(event.target.value);setTeam('all')}}><option value="all">Full NBA slate</option>{catalog.games.map(value=><option key={value.id} value={value.id}>{value.visitor_team.abbreviation} @ {value.home_team.abbreviation}</option>)}</select></label>
      <label>Team<select aria-label="First-basket team" value={team} onChange={event=>setTeam(event.target.value)}><option value="all">All teams</option>{catalog.teams.map(value=><option key={value.id} value={value.id}>{value.full_name}</option>)}</select></label>
      <label>Market<select aria-label="First-basket market" value={market} onChange={event=>setMarket(event.target.value)}><option value="all">All first-basket markets</option>{NBA_FIRST_MARKETS.map(value=><option key={value.key} value={value.key}>{value.label}</option>)}</select></label>
      <label>Book<select aria-label="First-basket sportsbook" value={book} onChange={event=>setBook(event.target.value)}><option value="all">All books</option>{catalog.books.map(value=><option key={value} value={value}>{bookName(value)}</option>)}</select></label>
      <label>Change from<select aria-label="First-basket movement baseline" value={basis} onChange={event=>setBasis(event.target.value)}><option value="opening">Opening capture</option><option value="previous">Previous capture</option></select></label>
      <label>Movement<select aria-label="First-basket movement direction" value={direction} onChange={event=>setDirection(event.target.value)}><option value="all">All movement</option><option value="shortened">Shortened</option><option value="lengthened">Lengthened</option><option value="unchanged">Unchanged</option><option value="untracked">Awaiting comparison</option></select></label>
      <label>Minimum Δ<select aria-label="Minimum first-basket change" value={minimum} onChange={event=>setMinimum(Number(event.target.value))}>{[0,.1,.25,.5,1,2,5].map(value=><option key={value} value={value}>{value===0?'Any change':`${value} pp`}</option>)}</select></label>
      <label>Sort<select aria-label="Sort first-basket prices" value={sort} onChange={event=>setSort(event.target.value)}><option value="movement">Most movement</option><option value="lengthened">Most lengthened</option><option value="shortened">Most shortened</option><option value="price">Longest best price</option><option value="shortest">Shortest best price</option><option value="name">Player A–Z</option><option value="game">Game time</option></select></label>
      <input aria-label="Search first-basket players" placeholder="Find a player" value={query} onChange={event=>setQuery(event.target.value)}/>
    </div>
    {error&&<p className={styles.notice} role="status">{error} <button onClick={()=>setRetry(n=>n+1)}>Retry</button></p>}
    {!slate&&!error&&<p className={styles.panelEmpty} role="status">Loading first-basket prices…</p>}
    {slate?.status==='connection_unavailable'&&<p className={styles.panelEmpty} role="status">First-basket prices unavailable.</p>}
    {slate&&slate.status!=='connection_unavailable'&&<p className={styles.finePrint}>{slate.loaded}/{slate.games} games · {slate.rows.length} prices · {groups.length} selections{slate.failed?` · ${slate.failed} games could not refresh`:''}</p>}
    {groups.length>0&&<div className={styles.oddsScroll} role="region" aria-label="First-basket book comparisons" tabIndex={0}><table className={styles.ladderTable}>
      <thead><tr><th>Player / market</th>{vendors.map(vendor=><th key={vendor}><BookLogo vendor={vendor} size={25}/><span>{bookName(vendor)}</span></th>)}</tr></thead>
      <tbody>{groups.map(group=>{
        const {row,quotes}=group,best=bestProbability(group),comparison=new Set(quotes.map(quote=>quote.offer.vendor)).size>1
        return <tr key={group.key}><th><div className={styles.firstBasketPlayer}><PlayerAvatar player={row.player}/><span><strong>{row.player.first_name} {row.player.last_name}</strong><small>{row.player.position} · {row.game.visitor_team.abbreviation} @ {row.game.home_team.abbreviation}</small></span></div><small className={styles.firstBasketMarket}>{NBA_FIRST_MARKETS.find(value=>value.key===row.offer.prop_type)?.label}</small></th>{vendors.map(vendor=>{
          const quote=quotes.find(value=>value.offer.vendor===vendor),isBest=comparison&&quote&&impliedProbability(nbaPrice(quote.offer))===best
          if(!quote)return <td key={vendor}>—</td>
          const opening=basis==='previous'?quote.movement?.previousOdds:quote.offer.opening?.over?.odds,at=basis==='previous'?quote.movement?.previousAt:quote.offer.opening?.over?.at
          return <td key={vendor} data-best={isBest}><div className={styles.firstBasketQuote}>
            {isBest&&<span className={styles.bestPrice}>Best price</span>}
            <PaintPriceValue current={nbaPrice(quote.offer)} opening={opening} at={at??undefined} openingLabel={basis==='previous'?'PREV':'OPEN'}/>
            <small className={styles.firstBasketCaptured}>{time(quote.offer.updated_at)} ET{quote.movement?.captures?` · ${quote.movement.captures} captures`:''}</small>
            <PaintPickActions player={quote.player} game={quote.game} offer={quote.offer} side="over"/>
          </div></td>
        })}</tr>
      })}</tbody>
    </table></div>}
    {slate&&slate.status!=='connection_unavailable'&&!groups.length&&<p className={styles.panelEmpty}>{slate.failed?'Price coverage is incomplete. Retry the failed games.':'No matching first-basket prices.'}</p>}
  </section>
}
