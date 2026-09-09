'use client'
import { useMemo, useState } from 'react'
import Image from 'next/image'
import { BookLogo } from '@/components/BookLogo'
import type { SidelineOddsBoard } from '@/lib/nflOddsTypes'
import { ladderOffers, ladderPrice, estimateLadderPicks, observedPropPicks, contractPicks, type LadderSide } from '@/lib/nflLadders'
import { americanImpliedProbability, impliedProbabilityRatio } from '@/lib/nflMarketMath'
import { nflPrimaryMarket } from '@/lib/nflPrimaryMarket'
import styles from './ladderBoard.module.css'
const price = (n: number | null) => n == null ? '—' : n > 0 ? '+'+n : String(n)
export function LadderBoard({ board, onPlayer }: { board: SidelineOddsBoard; onPlayer: (id: number) => void }) {
  const [prop,setProp]=useState('receiving_yards'),[vendor,setVendor]=useState('fanduel')
  const [side,setSide]=useState<LadderSide>('over'),[kind,setKind]=useState<'milestone'|'over_under'>('milestone')
  const [offset,setOffset]=useState(0),[mode,setMode]=useState<'odds'|'move'|'ratio'|'picks'>('odds')
  const [sortLine,setSortLine]=useState<number|null>(null)
  const props=useMemo(()=>Array.from(new Set(board.players.flatMap(p=>p.markets.map(m=>m.propType)))).sort(),[board])
  const books=useMemo(()=>Array.from(new Set(board.players.flatMap(p=>p.markets.flatMap(m=>m.offers.map(o=>o.vendor))))).sort(),[board])
  const rows=useMemo(()=>board.players.map(player=>({player,entries:ladderOffers(player,prop,vendor,side).filter(e=>e.offer.type===kind),estimated:estimateLadderPicks(player,prop,vendor)})).filter(r=>r.entries.length),[board,prop,vendor,side,kind])
  const thresholds=[...new Set(rows.flatMap(r=>r.entries.map(e=>e.line).filter((v):v is number=>v!=null)))].sort((a,b)=>a-b)
  const start=Math.min(offset,Math.max(0,Math.ceil(thresholds.length/6)-1)*6),visible=thresholds.slice(start,start+6)
  const entryValue=(row:typeof rows[number],line:number)=>{
    const e=row.entries.find(e=>e.line===line);if(!e)return null
    const now=ladderPrice(e.offer,side),open=ladderPrice(e.offer,side,true)
    if(mode==='odds')return americanImpliedProbability(now)
    if(mode==='picks')return contractPicks(row.player,prop,line,side,kind)??(side==='over'?row.estimated.get(e.market.key)??null:null)
    if(mode==='ratio'){const td=nflPrimaryMarket(row.player,'anytime_td',vendor)?.offers.find(o=>o.vendor===vendor);return impliedProbabilityRatio(td?ladderPrice(td,'over'):null,now)}
    const a=americanImpliedProbability(now),b=americanImpliedProbability(open)
    return a!=null&&b!=null&&e.offer.line===e.offer.openingLine?Math.round((a-b)*10000)/100:null
  }
  const ranges=new Map(visible.map(line=>{const v=rows.map(r=>entryValue(r,line)).filter((n):n is number=>n!=null);return [line,{min:Math.min(...v),max:Math.max(...v)}]}))
  const ordered=[...rows].sort((a,b)=>sortLine==null?a.player.team.localeCompare(b.player.team)||a.player.name.localeCompare(b.player.name):(entryValue(b,sortLine)??-Infinity)-(entryValue(a,sortLine)??-Infinity))
  return <section className={styles.panel} aria-label="NFL full market ladders">
    <header><div><h2>Market ladders</h2><small>{board.capturedAt?new Date(board.capturedAt).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' ET':'Awaiting capture'}</small></div><BookLogo vendor={vendor} size={24}/></header>
    <div className={styles.controls}>
      <label>Market<select value={prop} onChange={e=>{setProp(e.target.value);setOffset(0);setSortLine(null)}}>{props.map(p=><option key={p} value={p}>{p.replaceAll('_',' ')}</option>)}</select></label>
      <label>Book<select value={vendor} onChange={e=>{setVendor(e.target.value);setOffset(0);setSortLine(null)}}>{books.map(b=><option key={b}>{b}</option>)}</select></label>
      <label>Jump to threshold<select value={visible[0]??''} onChange={e=>setOffset(Math.floor(thresholds.indexOf(Number(e.target.value))/6)*6)}>{thresholds.filter((_,i)=>i%6===0).map(line=><option key={line} value={line}>{line}{kind==='milestone'?'+':''}</option>)}</select></label>
      <label>Contract<select value={kind} onChange={e=>{setKind(e.target.value as typeof kind);setOffset(0);if(e.target.value==='milestone')setSide('over')}}><option value="milestone">Milestones (+)</option><option value="over_under">O/U lines</option></select></label>
      <label>Side<select value={side} onChange={e=>setSide(e.target.value as LadderSide)}><option value="over">Over / milestone</option>{kind==='over_under'?<option value="under">Under</option>:null}</select></label>
      <label>Compare<select value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="odds">Odds</option><option value="move">Change · probability pp</option><option value="ratio">ATD / contract</option><option value="picks">Picks · observed / est.</option></select></label>
    </div>
    <div className={styles.legend}><span>{rows.length} players · {thresholds.length} thresholds · {side.toUpperCase()}</span><span title="Assumption model v1: 60% primary, 30% lower, 10% higher with decreasing tails. Not measured rung-level bets; missing groups redistribute their weight.">Est. = modeled picks ⓘ</span><span>Heat = relative {mode}; not predicted value</span></div>
    <div className={styles.scroll}><table><thead><tr><th>Player / observed prop picks</th>{visible.map(line=><th key={line}><button onClick={()=>setSortLine(line)}>{line}{kind==='milestone'?'+':''} {sortLine===line?'↓':''}</button></th>)}</tr></thead><tbody>{ordered.map(row=><tr key={row.player.id}>
      <td><button className={styles.player} onClick={()=>onPlayer(row.player.id)}>{row.player.headshot?<Image src={row.player.headshot} unoptimized={!row.player.headshot.startsWith('https://static.www.nfl.com/')} width={32} height={32} alt=""/>:null}<span><b>{row.player.name}</b><small>{row.player.team} · {row.player.position} · {observedPropPicks(row.player,prop)?.toLocaleString()??'—'} picks</small></span></button></td>
      {visible.map(line=>{const e=row.entries.find(e=>e.line===line);if(!e)return <td key={line}>—</td>;const now=ladderPrice(e.offer,side),open=ladderPrice(e.offer,side,true),v=entryValue(row,line),range=ranges.get(line)!;const strength=v!=null&&range.max>range.min?(v-range.min)/(range.max-range.min):null;const exact=contractPicks(row.player,prop,line,side,kind),est=side==='over'?row.estimated.get(e.market.key):null;return <td key={line} style={strength==null?undefined:{background:'rgba('+(strength>=.5?'80,220,142':'245,91,113')+','+(.04+Math.abs(strength-.5)*.36)+')'}}><b>{mode==='odds'?price(now):v==null?'—':mode==='picks'?(exact==null?'Est. ':'')+v.toLocaleString():v.toFixed(2)}</b><small>{mode==='odds'?'OPEN '+price(open):'ODDS '+price(now)}</small>{e.offer.openingLine!==e.offer.line?<small>OPEN LINE {e.offer.openingLine??'—'}</small>:null}{mode!=='picks'?<small>{exact!=null?exact+' picks':est!=null?'Est. '+est:'Picks —'}</small>:null}</td>})}
    </tr>)}</tbody></table></div>
    {!rows.length?<p>No matching contracts in this capture. Choose another market, book or contract type.</p>:null}
    <footer><button disabled={start===0} onClick={()=>setOffset(Math.max(0,start-6))}>← Lower</button><span>{thresholds.length?(start+1)+'–'+Math.min(start+6,thresholds.length)+' of '+thresholds.length:'0 thresholds'}</span><button disabled={start+6>=thresholds.length} onClick={()=>setOffset(start+6)}>Higher →</button></footer>
  </section>
}
