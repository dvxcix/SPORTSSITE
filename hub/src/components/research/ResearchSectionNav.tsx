'use client'

import type { ReactNode } from 'react'
import styles from './ResearchSectionNav.module.css'

export function ResearchSectionNav<T extends string>({ label, value, items, onChange, className = '' }: {
  label:string; value:T; items:readonly {value:T;label:string;icon?:ReactNode}[]; onChange:(value:T)=>void; className?:string
}) {
  return <div className={`${styles.root} ${className}`}>
    <label className={styles.mobile}><span className="sr-only">{label}</span><select aria-label={label} value={value} onChange={event=>onChange(event.target.value as T)}>{items.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    <nav className={styles.rail} aria-label={label} onKeyDown={event=>{
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return
      const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')], index=buttons.indexOf(event.target as HTMLButtonElement)
      if (index<0) return
      event.preventDefault()
      buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowLeft'?-1:1)+buttons.length)%buttons.length]?.focus()
    }}>{items.map(item=><button type="button" key={item.value} aria-pressed={value===item.value} onClick={()=>onChange(item.value)}>{item.icon}{item.label}</button>)}</nav>
  </div>
}
