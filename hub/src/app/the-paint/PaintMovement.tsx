'use client'
import { useEffect,useState } from 'react'
import { ArrowDownRight,ArrowUpRight,Minus } from 'lucide-react'
import { BookLogo } from '@/components/BookLogo'
import { PaintBookSelect } from './PaintEntitySelect'
import { nbaMovement,type PaintFrame } from '@/lib/nbaMovement'
import type { NbaQuoteOpeningRow } from '@/lib/nbaOddsHistory'
import { nbaBinary,type PaintBoard,type PaintMarket,type PaintPlayer } from '@/lib/nbaPaint'
import { watchNbaRefresh } from '@/lib/nbaRefresh'
import { PlayerAvatar } from './PaintVisuals'
import { PaintPriceValue } from './PaintPrice'
import styles from './paint.module.css'
function useHistory(game:number,market:PaintMarket,player?:number) {
  const key=`${game}:${market}:${player??'all'}`
  const [retry,setRetry]=useState(0)
  const [state,setState]=useState<{key:string;attempt:number;frames:PaintFrame[];openingRows:NbaQuoteOpeningRow[];error:boolean}>({key:'',attempt:-1,frames:[],openingRows:[],error:false})
  useEffect(()=>{
    const controller=new AbortController();let pending=false
    const update=async()=>{
      if(pending)return
      pending=true
      try{
        const r=await fetch(`/the-paint/history?game=${game}&market=${market}${player?`&player=${player}`:''}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(55000)]),cache:'no-store'})
        if(!r.ok)throw new Error('history')
        const json=await r.json() as {frames:PaintFrame[];openingRows?:NbaQuoteOpeningRow[]}
        if(!controller.signal.aborted)setState({key,attempt:retry,frames:json.frames,openingRows:json.openingRows??[],error:false})
      }catch{if(!controller.signal.aborted)setState(previous=>({key,attempt:retry,frames:previous.key===key?previous.frames:[],openingRows:previous.key===key?previous.openingRows:[],error:true}))}
      finally{pending=false}
    }
    void update();const stop=watchNbaRefresh(update)
    return()=>{stop();controller.abort()}
  },[game,market,player,key,retry])
  return {frames:state.key===key?state.frames:[],openingRows:state.key===key?state.openingRows:[],error:state.key===key&&state.attempt===retry&&state.error,loading:state.key!==key||state.attempt!==retry,refresh:()=>setRetry(value=>value+1)}
}
const signed=(n:number|null,digits=1)=>n==null?'—':`${n>0?'+':''}${n.toFixed(digits)}`
export function PaintMovement({board,market,players,player,side='over',book,onBookChange,open}:{board:PaintBoard;market:PaintMarket;players?:PaintPlayer[];player?:PaintPlayer;side?:'over'|'under';book?:string;onBookChange?:(book:string)=>void;open?:(id:number)=>void}) {
  const binary=nbaBinary(market),lineLabel=(line:number|undefined)=>line==null?'—':binary?(side==='over'?'Yes':'No'):String(line)
  const [localVendor,setLocalVendor]=useState('fanduel'),[direction,setDirection]=useState<'all'|'up'|'down'|'shorter'|'longer'>('all')
  const vendor=book ? book==='all'?'fanduel':book : localVendor
  const {frames:historyFrames,openingRows,error,loading,refresh}=useHistory(board.game.id,market,player?.id)
  const [selectedAt,setSelectedAt]=useState<string|null>(null)
  const captureIndex=selectedAt==null?historyFrames.length-1:Math.max(0,historyFrames.findLastIndex(f=>f.captured_at<=selectedAt))
  const frames=historyFrames.slice(0,captureIndex+1)
  const vendors=[...new Set(frames.flatMap(f=>f.props.map(p=>p.vendor)))].sort()
  const rows=(player?[player]:players??board.players).map(p=>({player:p,movement:nbaMovement(frames,p.id,market,vendor,side,openingRows)})).filter(r=>r.movement.latest && (direction==='all'||direction==='up'&&(r.movement.lineChange??0)>0||direction==='down'&&(r.movement.lineChange??0)<0||direction==='shorter'&&(r.movement.priceChange??0)>0||direction==='longer'&&(r.movement.priceChange??0)<0)).sort((a,b)=>Math.abs(b.movement.lineChange??0)-Math.abs(a.movement.lineChange??0)||Math.abs(b.movement.priceChange??0)-Math.abs(a.movement.priceChange??0))
  return <section className={styles.movement}><div className={styles.movementTools}><PaintBookSelect label="Movement sportsbook" value={vendor} onChange={value=>{setLocalVendor(value);onBookChange?.(value)}} books={[...new Set(['fanduel',vendor,...vendors])]} allowAll={false}/><select aria-label="Movement direction" value={direction} onChange={e=>setDirection(e.target.value as typeof direction)}><option value="all">All movement</option><option value="up">Line rising</option><option value="down">Line falling</option><option value="shorter">Odds shortening</option><option value="longer">Odds lengthening</option></select></div>{error&&<p role="status" className={styles.notice}>{frames.length?'History could not refresh. Last loaded captures are shown.':'Market history could not load.'} <button className={styles.filterToggle} onClick={refresh}>Retry</button></p>}{loading&&!frames.length?<div className={styles.panelEmpty} role="status">Loading market history…</div>:!frames.length?!error&&<div className={styles.panelEmpty}>Tracking this matchup. Movement appears after the first changed quote is captured.</div>:<><div className={styles.captureReplay}><label htmlFor={`paint-capture-${player?.id??'board'}`}>Market Story <span>{selectedAt==null?'Latest capture':'Historical capture'} · {captureIndex+1}/{historyFrames.length}</span></label><input id={`paint-capture-${player?.id??'board'}`} aria-label="NBA Market Story capture" type="range" min="0" max={Math.max(0,historyFrames.length-1)} step="1" value={captureIndex} onChange={e=>{const index=Number(e.target.value);setSelectedAt(index===historyFrames.length-1?null:historyFrames[index].captured_at)}} disabled={historyFrames.length<2}/><button onClick={()=>setSelectedAt(null)} disabled={selectedAt==null}>Latest</button></div><div className={styles.captureSummary}><BookLogo vendor={vendor} size={21}/><span>{frames.length} captures<small>{new Date(frames[0].captured_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})} → {new Date(frames.at(-1)!.captured_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})} ET</small></span><time>5m captures</time></div><div className={styles.movementRows}>{rows.map(({player:p,movement:m})=><article key={p.id}>{!player && <button className={styles.playerButton} onClick={()=>open?.(p.id)}><PlayerAvatar player={p}/><span><strong>{p.first_name} {p.last_name}</strong><small>{p.team.name}</small></span></button>}<div className={styles.movementNumbers}><span><small>FIRST SHOWN → {selectedAt==null?'LATEST':'CAPTURE'}</small><b>{lineLabel(m.first?.line)} <i>→</i> {lineLabel(m.latest?.line)}</b></span><span><small>LINE Δ</small><b className={(m.lineChange??0)>0?styles.hit:(m.lineChange??0)<0?styles.miss:styles.muted}>{m.lineChange==null?<Minus size={13}/>:m.lineChange>0?<ArrowUpRight size={13}/>:m.lineChange<0?<ArrowDownRight size={13}/>:null}{signed(m.lineChange)}</b></span><span><small>{binary?(side==='over'?'YES':'NO'):side.toUpperCase()} PRICE Δ</small><PaintPriceValue current={m.priceLatestOdds ?? (side==='over'?m.latest?.over:m.latest?.under)} opening={m.priceFirstOdds} at={m.priceFirstAt??undefined} openingLabel={m.priceOpeningKnown?'OPEN':'FIRST'} compact/></span></div>{player&&!binary&&m.points.length>1&&<svg className={styles.movementChart} viewBox="0 0 300 90" role="img" aria-label={`Observed reference lines: ${m.points.map(p=>p.line).join(', ')}`}><polyline fill="none" stroke="#b4ff4d" strokeWidth="2" points={m.points.map(p=>`${(Date.parse(p.at)-Date.parse(m.points[0].at))/Math.max(1,Date.parse(m.points.at(-1)!.at)-Date.parse(m.points[0].at))*290+5},${78-(p.line-Math.min(...m.points.map(p=>p.line)))/Math.max(1,Math.max(...m.points.map(p=>p.line))-Math.min(...m.points.map(p=>p.line)))*64}`).join(' ')}/></svg>}</article>)}</div>{!rows.length&&<div className={styles.panelEmpty}>No matching movement for this book and market.</div>}<p className={styles.finePrint}>OPEN: first captured quote · FIRST: earliest available quote · Δ: probability points at the same line</p></>}</section>
}
