'use client'

import type { ReactNode } from 'react'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import styles from './ResearchWorkspacePicker.module.css'

export function ResearchWorkspacePicker({ label, value, onChange, disabled, children, className='' }: {
  label:string; value:string; onChange:(value:string)=>void; disabled?:boolean; children:ReactNode; className?:string
}) {
  return <label className={`${styles.picker} ${className}`}>
    <span aria-hidden="true"><SlidersHorizontal size={15}/>Tools<ChevronDown size={13}/></span>
    <select aria-label={label} value={value} disabled={disabled} onChange={event=>onChange(event.target.value)}>{children}</select>
  </label>
}
