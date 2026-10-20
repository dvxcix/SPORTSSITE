'use client'
import { useMemo,useState } from 'react'
import { PAINT_MARKETS,nbaBinary,type PaintBoard,type PaintMarket } from '@/lib/nbaPaint'
import { compareMilestoneMoves,nbaMilestonePeerRanks,type NbaMilestoneMove,type NbaMoveSort } from '@/lib/nbaMilestoneSignals'
import { PaintBookSelect,PaintTeamSelect } from './PaintEntitySelect'
import { BookLogo } from '@/components/BookLogo'
import { PlayerAvatar } from './PaintVisuals'
import { PaintPriceValue } from './PaintPrice'
import styles from './paint.module.css'
import polish from './research-polish.module.css'

const marketName=(market:string)=>PAINT_MARKETS.find(m=>m.key===market)?.label??market
const direction=(move:NbaMilestoneMove)=>move.change==null?'Awaiting history':move.change<0?'Lengthened':move.change>0?'Shortened':'Unchanged'
const href=(board:PaintBoard,move:NbaMilestoneMove)=>`/the-paint?${new URLSearchParams({date:board.game.date,game:String(board.game.id),market:move.market,book:move.book,contract:'milestone',target:String(move.line),player:String(move.playerId),line:String(move.line),type:'milestone',side:'over',view:'research',panel:'ladder'})}`
export function PaintMilestoneSignals({board,moves,onOverUnder,loading,error,retry,stale,initialMarket,initialTarget,initialBook}:{board:PaintBoard;moves:NbaMilestoneMove[];onOverUnder:()=>void;loading:boolean;error:string;retry:()=>void;stale:boolean;initialMarket?:PaintMarket;initialTarget?:number;initialBook?:string}){
  const [market,setMarket]=useState<PaintMarket>(initialMarket??'points'),[target,setTarget]=useState(initialTarget!=null?String(initialTarget):initialMarket&&initialMarket!=='points'?'all':'15'),[relatedMarket,setRelatedMarket]=useState('all'),[relatedTarget,setRelatedTarget]=useState('all'),[book,setBook]=useState(initialBook??'all'),[team,setTeam]=useState('all'),[query,setQuery]=useState(''),[sort,setSort]=useState<NbaMoveSort>('lengthened'),[moveDirection,setDirection]=useState('all'),[opposed,setOpposed]=useState(true),[minimum,setMinimum]=useState('0.25'),[expanded,setExpanded]=useState<string|null>(null)
  const players=useMemo(()=>new Map(board.players.map(p=>[p.id,p])),[board.players])
  const names=useMemo(()=>new Map(board.players.map(p=>[p.id,`${p.last_name} ${p.first_name}`])),[board.players])
  const ranks=useMemo(()=>nbaMilestonePeerRanks(moves,new Map(board.players.map(p=>[p.id,p.team.id]))),[moves,board.players])
  const targets=[...new Set(moves.filter(m=>m.market===market&&(book==='all'||m.book===book)).map(m=>m.line))].sort((a,b)=>a-b)
  const relatedTargets=[...new Set(moves.filter(m=>relatedMarket==='all'||m.market===relatedMarket).map(m=>m.line))].sort((a,b)=>a-b)
  const related=(move:NbaMilestoneMove)=>moves.filter(other=>other.playerId===move.playerId&&other.gameId===move.gameId&&other.book===move.book&&other.market!==move.market&&(relatedMarket==='all'||other.market===relatedMarket)&&(relatedTarget==='all'||other.line===Number(relatedTarget))&&other.change!=null&&Math.abs(other.change)>=Number(minimum)&&(!opposed||move.change!=null&&move.change*other.change<0)).sort((a,b)=>compareMilestoneMoves(a,b,'absolute'))
  const rows=moves.filter(move=>{
    const p=players.get(move.playerId)
    return p&&move.market===market&&(target==='all'||move.line===Number(target))&&(book==='all'||move.book===book)&&(team==='all'||String(p.team.id)===team)&&`${p.first_name} ${p.last_name}`.toLowerCase().includes(query.toLowerCase())&&(move.change!=null?Math.abs(move.change)>=Number(minimum):!opposed&&minimum==='0')&&(moveDirection==='all'||moveDirection==='longer'&&move.change!=null&&move.change<0||moveDirection==='shorter'&&move.change!=null&&move.change>0||moveDirection==='unchanged'&&move.change===0)&&(!opposed||related(move).length>0)
  }).sort((a,b)=>compareMilestoneMoves(a,b,sort,names))
  return <section className={styles.researchTool} aria-label="Milestone cross-market comparison">
    <header className={styles.toolHeading}><h3>Milestone cross-market</h3><div className={styles.segment}><button aria-pressed>Milestones · N+</button><button onClick={onOverUnder}>O/U references</button></div><button aria-label="Refresh cross-market signals" onClick={retry}>Refresh</button></header>
    <p className={styles.finePrint}>Compare the exact same target and book across teammates, then inspect that player’s other milestones. Negative probability-point change means odds lengthened; positive means shortened. Peer ranks use the full team pool before filters.</p>
    <div className={styles.toolControls}>
      <label>Primary market <select aria-label="Cross-market primary market" value={market} onChange={e=>{setMarket(e.target.value as PaintMarket);setTarget('all')}}>{PAINT_MARKETS.filter(m=>!nbaBinary(m.key)).map(m=><option key={m.key} value={m.key}>{m.label}</option>)}</select></label>
      <label>Target <select aria-label="Cross-market primary milestone" value={target} onChange={e=>setTarget(e.target.value)}><option value="all">All N+ targets</option>{target!=='all'&&!targets.includes(Number(target))&&<option value={target}>{target}+ · not posted</option>}{targets.map(line=><option key={line} value={line}>{line}+</option>)}</select></label>
      <PaintTeamSelect label="Cross-market team" value={team} onChange={setTeam} teams={[board.game.visitor_team,board.game.home_team]}/>
      <PaintBookSelect label="Cross-market sportsbook" value={book} onChange={setBook} books={[...new Set(moves.map(m=>m.book))].sort()}/>
      <label>Related market <select aria-label="Cross-market related market" value={relatedMarket} onChange={e=>{setRelatedMarket(e.target.value);setRelatedTarget('all')}}><option value="all">Any other market</option>{PAINT_MARKETS.filter(m=>m.key!==market&&!nbaBinary(m.key)).map(m=><option key={m.key} value={m.key}>{m.label}</option>)}</select></label>
      <label>Related target <select aria-label="Cross-market related milestone" value={relatedTarget} onChange={e=>setRelatedTarget(e.target.value)}><option value="all">All related N+ targets</option>{relatedTargets.map(line=><option key={line} value={line}>{line}+</option>)}</select></label>
      <label>Direction <select aria-label="Cross-market movement direction" value={moveDirection} onChange={e=>setDirection(e.target.value)}><option value="all">All primary moves</option><option value="longer">Lengthened</option><option value="shorter">Shortened</option><option value="unchanged">Unchanged</option></select></label>
      <label>Sort <select aria-label="Sort milestone cross-market" value={sort} onChange={e=>setSort(e.target.value as NbaMoveSort)}><option value="lengthened">Most lengthened first</option><option value="shortened">Most shortened first</option><option value="absolute">Largest move either way</option><option value="name">Player name</option></select></label>
      <label>Minimum move <select aria-label="Minimum cross-market move" value={minimum} onChange={e=>setMinimum(e.target.value)}>{['0','0.25','1','2','5'].map(n=><option key={n} value={n}>{n} pp</option>)}</select></label>
      <input aria-label="Search milestone players" placeholder="Find a player" value={query} onChange={e=>setQuery(e.target.value)}/>
      <button aria-pressed={opposed} onClick={()=>setOpposed(v=>!v)}>{opposed?'Opposing moves only':'All primary moves'}</button>
    </div>
    {error&&<p role="status" className={polish.status}>{error} <button onClick={retry}>Retry</button></p>}
    {loading?<p role="status" className={polish.empty}>Loading market signals…</p>:<><p className={polish.status}>{rows.length} primary milestone selections{stale?' · last available capture':''}</p>
      {!rows.length&&<div className={polish.empty}>No exact milestone pairs match these filters. Try another target or turn off “Opposing moves only” to inspect all primary prices.</div>}
      <div className={polish.cards}>{rows.map(move=>{const p=players.get(move.playerId)!,peers=ranks.get(move.key),others=related(move),shown=expanded===move.key?others:others.slice(0,3);return <article className={polish.card} key={move.key}>
        <header><a className={styles.playerButton} href={href(board,move)}><PlayerAvatar player={p}/><span><strong>{p.first_name} {p.last_name}</strong><small>{p.team.abbreviation} · {marketName(move.market)} {move.line}+</small></span></a><BookLogo vendor={move.book} size={24}/></header>
        <div className={polish.signalPair}><a className={polish.signalQuote} href={href(board,move)}><strong>{direction(move)}{move.change!=null?` · ${move.change>0?'+':''}${move.change.toFixed(2)} pp`:''}</strong><PaintPriceValue current={move.current} opening={move.opening} at={move.firstAt??undefined} openingLabel={move.openingKnown?'OPEN':'FIRST'} compact/>{peers&&move.change!==0&&<small>{move.change!<0?'Lengthen':'Shorten'} rank #{move.change!<0?peers.lengthened:peers.shortened}/{peers.players} teammates at {move.line}+ · {move.book}</small>}</a>
          <div>{shown.map(other=><a className={polish.signalQuote} key={other.key} href={href(board,other)}><strong>{marketName(other.market)} {other.line}+ · {direction(other)}</strong><PaintPriceValue current={other.current} opening={other.opening} at={other.firstAt??undefined} openingLabel={other.openingKnown?'OPEN':'FIRST'} compact/><small>{other.change!>0?'+':''}{other.change?.toFixed(2)} pp</small></a>)}{others.length>3&&<button className={styles.filterToggle} onClick={()=>setExpanded(expanded===move.key?null:move.key)}>{expanded===move.key?'Show fewer':`Show all ${others.length} related targets`}</button>}</div>
        </div>
      </article>})}</div></>}
  </section>
}
