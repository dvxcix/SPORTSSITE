'use client'
import { useEffect,useState } from 'react'
import type { FirstBasketRow } from '@/lib/nbaFirstBasketOdds'
import { NBA_FIRST_MARKETS } from '@/lib/nbaFirstBasketMarkets'
import { nbaOdds,nbaPrice } from '@/lib/nbaPaint'
import { watchNbaRefresh } from '@/lib/nbaRefresh'
import { BookLogo,bookName } from '@/components/BookLogo'
import { PaintPickActions } from './PaintPickActions'
import styles from './paint.module.css'
type Slate={date:string;requestedDate:string;games:number;loaded:number;failed:number;status:string;unmatched:number;rows:FirstBasketRow[];fetchedAt:string}
export function PaintFirstBasketOdds({date}:{date:string}){
  const [state,setState]=useState<Slate|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[game,setGame]=useState('all'),[market,setMarket]=useState('all'),[book,setBook]=useState('all'),[query,setQuery]=useState(''),[sort,setSort]=useState('price')
  useEffect(()=>{const controller=new AbortController();let pending=false
    const update=async()=>{if(pending)return;pending=true;try{
      const response=await fetch(`/the-paint/first-basket/odds?date=${date}`,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(115000)])})
      if(!response.ok)throw new Error('unavailable')
      const data=await response.json() as Slate
      if(!controller.signal.aborted){setState(data);setError('')}
    }catch{if(!controller.signal.aborted)setError('First-basket prices could not refresh.')}finally{pending=false}}
    void update();const stop=watchNbaRefresh(update);return()=>{controller.abort();stop()}
  },[date,retry])
  const slate=state?.requestedDate===date?state:null,rows=slate?.rows??[],books=[...new Set(rows.map(r=>r.offer.vendor))].sort(),games=[...new Map(rows.map(r=>[r.game.id,r.game])).values()]
  const shown=rows.filter(r=>(game==='all'||String(r.game.id)===game)&&(market==='all'||r.offer.prop_type===market)&&(book==='all'||r.offer.vendor===book)&&`${r.player.first_name} ${r.player.last_name}`.toLowerCase().includes(query.toLowerCase()))
  const bestPrice=(row:FirstBasketRow)=>Math.max(...shown.filter(r=>r.game.id===row.game.id&&r.player.id===row.player.id&&r.offer.prop_type===row.offer.prop_type).map(r=>nbaPrice(r.offer)??-Infinity))
  const groups=[...new Map(shown.map(r=>[`${r.game.id}:${r.player.id}:${r.offer.prop_type}`,r])).values()].sort((a,b)=>sort==='name'?`${a.player.last_name} ${a.player.first_name}`.localeCompare(`${b.player.last_name} ${b.player.first_name}`):sort==='game'?Date.parse(a.game.datetime??a.game.status)-Date.parse(b.game.datetime??b.game.status):sort==='shortest'?bestPrice(a)-bestPrice(b):bestPrice(b)-bestPrice(a))
  const vendors=book==='all'?books:[book]
  return <section aria-label="First-basket slate odds" className={`${styles.movement} ${styles.firstBasketOdds}`}>
    <div className={styles.sectionHeading}><h3>First-basket odds · NBA slate</h3><button className={styles.filterToggle} onClick={()=>setRetry(n=>n+1)}>Refresh prices</button></div>
    <p className={styles.finePrint}>Compare the same player, winning event and method. First field goal excludes free throws; first basket includes them. Saved selections retain the exact book, price and rules.</p>
    <div className={styles.movementTools}><label>Game <select aria-label="First-basket game" value={game} onChange={e=>setGame(e.target.value)}><option value="all">Full NBA slate</option>{games.map(g=><option key={g.id} value={g.id}>{g.visitor_team.abbreviation} @ {g.home_team.abbreviation}</option>)}</select></label><label>Market <select aria-label="First-basket market" value={market} onChange={e=>setMarket(e.target.value)}><option value="all">All first-basket markets</option>{NBA_FIRST_MARKETS.map(m=><option key={m.key} value={m.key}>{m.label}</option>)}</select></label><label>Book <select aria-label="First-basket sportsbook" value={book} onChange={e=>setBook(e.target.value)}><option value="all">All books</option>{books.map(b=><option key={b} value={b}>{bookName(b)}</option>)}</select></label><label>Sort <select aria-label="Sort first-basket prices" value={sort} onChange={e=>setSort(e.target.value)}><option value="price">Longest best price first</option><option value="shortest">Shortest best price first</option><option value="name">Player A–Z</option><option value="game">Game time</option></select></label><input aria-label="Search first-basket players" placeholder="Find a player" value={query} onChange={e=>setQuery(e.target.value)}/></div>
    {error&&<p className={styles.notice} role="status">{error} <button onClick={()=>setRetry(n=>n+1)}>Retry</button></p>}
    {!slate&&!error&&<p className={styles.panelEmpty} role="status">Loading first-basket prices across the NBA slate…</p>}
    {slate?.status==='connection_unavailable'&&<p className={styles.panelEmpty} role="status">Live first-basket odds are not connected. Pricing is unavailable until the connection is configured.</p>}
    {slate&&slate.status!=='connection_unavailable'&&<p className={styles.finePrint}>{slate.loaded}/{slate.games} games checked{slate.failed?` · ${slate.failed} games could not refresh`:''} · {rows.length} posted prices{slate.unmatched?` · ${slate.unmatched} unverified prices withheld`:''}</p>}
    {groups.length>0&&<div className={styles.oddsScroll} role="region" aria-label="First-basket book comparisons" tabIndex={0}><table className={styles.ladderTable}><thead><tr><th>Player / market</th>{vendors.map(v=><th key={v}><BookLogo vendor={v} size={25}/><span className={styles.srOnly}>{bookName(v)}</span></th>)}</tr></thead><tbody>{groups.map(row=>{
      const matching=shown.filter(r=>r.game.id===row.game.id&&r.player.id===row.player.id&&r.offer.prop_type===row.offer.prop_type),best=Math.max(...matching.map(r=>nbaPrice(r.offer)??-Infinity)),comparison=new Set(matching.map(r=>r.offer.vendor)).size>1
      return <tr key={`${row.game.id}:${row.player.id}:${row.offer.prop_type}`}><th>{row.player.first_name} {row.player.last_name}<small>{row.game.visitor_team.abbreviation} @ {row.game.home_team.abbreviation} · {NBA_FIRST_MARKETS.find(m=>m.key===row.offer.prop_type)?.label}</small></th>{vendors.map(v=>{const quote=matching.find(r=>r.offer.vendor===v);return <td key={v} data-best={comparison&&quote&&nbaPrice(quote.offer)===best}>{quote?<div className={styles.ladderQuote}>{comparison&&nbaPrice(quote.offer)===best&&<span className={styles.bestPrice}>Best price</span>}<b>{nbaOdds(nbaPrice(quote.offer))}</b><small>{new Date(quote.offer.updated_at).toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'})} ET</small><PaintPickActions player={quote.player} game={quote.game} offer={quote.offer} side="over"/></div>:'—'}</td>})}</tr>
    })}</tbody></table></div>}
    {slate&&slate.status!=='connection_unavailable'&&!shown.length&&<p className={styles.panelEmpty}>{slate.failed?'Price coverage is incomplete. Retry the failed games.':'No matching first-basket prices are posted in the checked coverage.'}</p>}
  </section>
}
