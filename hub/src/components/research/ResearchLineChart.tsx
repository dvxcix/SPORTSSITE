'use client'

import { useState } from 'react'
import styles from './ResearchLineChart.module.css'

export type ResearchPoint = { label:string; value:number|null; x?:number }

/** Observations only: missing values break the line rather than becoming zero. */
export function ResearchLineChart({ points, label, formatValue = value=>value.toFixed(1) }: {
  points:ResearchPoint[]; label:string; formatValue?:(value:number)=>string
}) {
  const [hover,setHover] = useState<number|null>(null)
  const [focus,setFocus] = useState<number|null>(null)
  const [tabStop,setTabStop] = useState(0)
  const known = points.flatMap((point,index)=>point.value!=null&&Number.isFinite(point.value)?[{...point,value:point.value,index}]:[])
  if (!known.length) return <p className={styles.empty} role="status">No observations available.</p>
  const minimum = Math.min(...known.map(point=>point.value)), maximum = Math.max(...known.map(point=>point.value))
  const padding = (maximum-minimum)*.1 || Math.abs(maximum)*.1 || 1
  const low = minimum>=0?Math.max(0,minimum-padding):minimum-padding, high = maximum+padding
  const positions = points.map((point,index)=>({
    x:4+(point.x!=null&&Number.isFinite(point.x)?Math.max(0,Math.min(1,point.x)):index/Math.max(1,points.length-1))*92,
    y:point.value==null||!Number.isFinite(point.value)?null:95-(point.value-low)/(high-low)*90,
  }))
  const path = positions.map((point,index)=>point.y==null?'':`${index>0&&positions[index-1].y!=null?'L':'M'}${point.x},${point.y}`).join(' ')
  const active = hover??focus, selected = active==null?null:known.find(point=>point.index===active)
  const focusable = known.some(point=>point.index===tabStop)?tabStop:known[0].index
  return <figure className={styles.figure} aria-label={label}>
    <div className={styles.frame}>
      <div className={styles.axis} aria-hidden="true"><span>{formatValue(high)}</span><span>{formatValue((high+low)/2)}</span><span>{formatValue(low)}</span></div>
      <div className={styles.plot} onPointerLeave={()=>setHover(null)}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path className={styles.grid} d="M0 5H100 M0 50H100 M0 95H100"/><path className={styles.line} d={path}/></svg>
        {known.map(point=><button key={point.index} type="button" data-line-point data-active={active===point.index||undefined} className={styles.point} style={{left:`${positions[point.index].x}%`,top:`${positions[point.index].y}%`}} tabIndex={point.index===focusable?0:-1} aria-label={`${point.label}: ${formatValue(point.value)}`} onPointerEnter={()=>setHover(point.index)} onFocus={()=>{setFocus(point.index);setTabStop(point.index)}} onBlur={()=>setFocus(null)} onClick={()=>setHover(point.index)} onKeyDown={event=>{
          if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return
          event.preventDefault()
          setHover(null)
          const index=known.findIndex(item=>item.index===point.index)
          const next=event.key==='Home'?0:event.key==='End'?known.length-1:(index+(event.key==='ArrowLeft'?-1:1)+known.length)%known.length
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button[data-line-point]')[next]?.focus({preventScroll:true})
        }}/>) }
      </div>
    </div>
    <div className={styles.dates} aria-hidden="true"><span>{points[0]?.label}</span><span>{points.at(-1)?.label}</span></div>
    <figcaption><output aria-live="polite">{selected?`${selected.label} · ${formatValue(selected.value)}`:`${known.length}/${points.length} observations`}</output></figcaption>
  </figure>
}
