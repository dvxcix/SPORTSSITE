'use client'
import { ArrowDown } from 'lucide-react'
import type { ReactNode } from 'react'
import styles from './table-controls.module.css'

export function PaintSortHeader({ label, column, active, ascending, onSort, children }: { label: string; column: string; active: string; ascending: boolean; onSort: (column: string) => void; children?: ReactNode }) {
  const selected = active === column
  return <th aria-sort={selected ? ascending ? 'ascending' : 'descending' : 'none'}><button className={styles.sortHeader} aria-label={children ? label : undefined} onClick={() => onSort(column)}>{children ?? label}<ArrowDown size={12} aria-hidden="true" className={selected ? styles.active : styles.idle} style={selected && ascending ? { transform: 'rotate(180deg)' } : undefined}/></button></th>
}
