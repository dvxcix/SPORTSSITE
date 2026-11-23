'use client'

import { useState } from 'react'
import { americanImpliedProbability } from '@/lib/nflMarketMath'
import { PREVIEW_CONFIG, type PreviewSport } from '@/lib/publicResearchPreview'
import type { PreviewIdentityPlayer } from './PreviewIdentity'
import styles from './PreviewPlayerChart.module.css'

const price = (value:number) => value > 0 ? '+' + value : '−' + Math.abs(value)

/** Only observed samples and actual offered prices. No simulated performance. */
export function PreviewPlayerChart({ player, sport, line, onLineChange }: {
  player:PreviewIdentityPlayer; sport:PreviewSport; line:number|null; onLineChange?:(value:number)=>void
}) {
  const [inspected, setInspected] = useState<number | null>(null)
  const recent=(player.recent ?? []).filter(value=>Number.isFinite(value)&&value>=0).slice(-10)
  const quotes=[...player.prices].sort((a,b)=>a.line-b.line).flatMap(quote=>{
    const probability=americanImpliedProbability(quote.price)
    return probability==null?[]:[{...quote,probability}]
  })
  const title=recent.length?'Recent games':'Sportsbook ladder'
  const maximum=Math.max(1,line??0,...recent)*1.15
  const selected=inspected==null?null:recent.length?recent[inspected]:quotes[inspected]
  const readout=selected==null?'':typeof selected==='number'?`Game ${inspected!+1}: ${selected} ${PREVIEW_CONFIG[sport].title.toLowerCase()}`:`${selected.line}+ at ${price(selected.price)}`
  return <figure className={styles.figure} aria-label={`${player.name} ${title.toLowerCase()}`}>
    <figcaption><strong>{title}</strong><span>{recent.length?`${PREVIEW_CONFIG[sport].title} · oldest to newest`:PREVIEW_CONFIG[sport].title}</span></figcaption>
    <div className={styles.scroll} role="region" aria-label={title + ', scroll for all observations'} tabIndex={0}>
      <div className={styles.bars} data-kind={recent.length?'results':'prices'}>
        {recent.length?recent.map((value,index)=><button type="button" key={index} className={styles.bar} aria-label={`Game ${index+1}: ${value} ${PREVIEW_CONFIG[sport].title.toLowerCase()}`} data-hit={line==null?undefined:value>=line}
          onPointerEnter={()=>setInspected(index)} onFocus={()=>setInspected(index)} onClick={()=>setInspected(index)}>
          <span className={styles.barValue}>{value}</span><span className={styles.barTrack}><i className={styles.fill} style={{height:`${value/maximum*100}%`}} /></span><small>{index+1}</small>
        </button>):quotes.map((quote,index)=><button type="button" key={quote.line} className={styles.bar} data-selected={quote.line===line} aria-pressed={quote.line===line} aria-label={`${quote.line}+ ${PREVIEW_CONFIG[sport].title.toLowerCase()} at ${price(quote.price)}`}
          onPointerEnter={()=>setInspected(index)} onFocus={()=>setInspected(index)} onClick={()=>{setInspected(index);onLineChange?.(quote.line)}}>
          <span className={styles.barValue}>{price(quote.price)}</span><span className={styles.barTrack}><i className={styles.fill} style={{height:`${quote.probability*100}%`}} /></span><small>{quote.line}+</small>
        </button>)}
      </div>
    </div>
    {!recent.length&&!quotes.length&&<p className={styles.empty}>No saved quotes for this player.</p>}
    <output className={styles.readout} aria-live="polite">{readout|| (recent.length?`${recent.length} observed games${line==null?'':' · '+line+'+ reference'}`:'Choose a milestone to inspect its price.')}</output>
  </figure>
}
