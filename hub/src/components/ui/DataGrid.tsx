'use client'

import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Columns3, Rows3 } from 'lucide-react'
import styles from './DataGrid.module.css'

export type DataGridColumn<Row> = {
  id: string
  header: ReactNode
  cell: (row: Row) => ReactNode
  sortValue?: (row: Row) => string | number | null | undefined
  mobileLabel?: ReactNode
  pinned?: boolean
  align?: 'left' | 'center' | 'right'
  defaultVisible?: boolean
  className?: string
}

type SortState = { id: string; direction: 'asc' | 'desc' } | null

function restore<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const value = window.localStorage.getItem(key)
    return value ? JSON.parse(value) as T : fallback
  } catch {
    return fallback
  }
}

export function DataGrid<Row>({
  ariaLabel,
  rows,
  columns,
  getRowKey,
  storageKey,
  empty,
  initialRowLimit = 100,
}: {
  ariaLabel: string
  rows: Row[]
  columns: DataGridColumn<Row>[]
  getRowKey: (row: Row) => string
  storageKey: string
  empty?: ReactNode
  initialRowLimit?: number
}) {
  const defaults = useMemo(() => columns.filter(column => column.defaultVisible !== false).map(column => column.id), [columns])
  const [visibleIds, setVisibleIds] = useState<string[]>(defaults)
  const [density, setDensity] = useState<'compact' | 'comfortable'>('comfortable')
  const [sort, setSort] = useState<SortState>(null)
  const [limit, setLimit] = useState(initialRowLimit)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setVisibleIds(restore<string[]>(`${storageKey}:columns`, defaults).filter(id => columns.some(column => column.id === id)))
      const savedDensity = restore<string>(`${storageKey}:density`, 'comfortable')
      setDensity(savedDensity === 'compact' ? 'compact' : 'comfortable')
    })
    return () => window.cancelAnimationFrame(frame)
  }, [columns, defaults, storageKey])

  const visible = columns.filter(column => visibleIds.includes(column.id) || column.pinned)
  const sortedRows = useMemo(() => {
    if (!sort) return rows
    const column = columns.find(item => item.id === sort.id)
    if (!column?.sortValue) return rows
    return [...rows].sort((left, right) => {
      const a = column.sortValue?.(left)
      const b = column.sortValue?.(right)
      if (a == null && b == null) return 0
      if (a == null) return 1
      if (b == null) return -1
      const result = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
      return sort.direction === 'asc' ? result : -result
    })
  }, [columns, rows, sort])
  const displayedRows = sortedRows.slice(0, limit)

  function toggleColumn(id: string) {
    const column = columns.find(item => item.id === id)
    if (!column || column.pinned) return
    setVisibleIds(current => {
      const next = current.includes(id) ? current.filter(value => value !== id) : [...current, id]
      window.localStorage.setItem(`${storageKey}:columns`, JSON.stringify(next))
      return next
    })
  }

  function toggleDensity() {
    const next = density === 'comfortable' ? 'compact' : 'comfortable'
    setDensity(next)
    window.localStorage.setItem(`${storageKey}:density`, JSON.stringify(next))
  }

  function updateSort(column: DataGridColumn<Row>) {
    if (!column.sortValue) return
    setSort(current => current?.id === column.id ? { id: column.id, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { id: column.id, direction: 'asc' })
  }

  return <section className={styles.shell} data-density={density} aria-label={ariaLabel}>
    <div className={styles.toolbar}>
      <span>{rows.length.toLocaleString()} row{rows.length === 1 ? '' : 's'}</span>
      <div>
        <button type="button" onClick={toggleDensity} aria-label={`Use ${density === 'comfortable' ? 'compact' : 'comfortable'} row density`}><Rows3 size={14}/><span>{density === 'comfortable' ? 'Comfortable' : 'Compact'}</span></button>
        <details className={styles.columns}>
          <summary><Columns3 size={14}/><span>Columns</span></summary>
          <div>{columns.map(column => <button type="button" key={column.id} aria-pressed={visible.some(item => item.id === column.id)} disabled={column.pinned} onClick={() => toggleColumn(column.id)}><i>{visible.some(item => item.id === column.id) && <Check size={11}/>}</i><span>{column.mobileLabel || column.header}</span></button>)}</div>
        </details>
      </div>
    </div>

    {displayedRows.length ? <>
      <div className={styles.desktop}>
        <table>
          <thead><tr>{visible.map(column => <th key={column.id} className={`${column.pinned ? styles.pinned : ''} ${column.className || ''}`} data-align={column.align || 'left'}>{column.sortValue ? <button type="button" onClick={() => updateSort(column)} aria-label={`Sort by ${String(column.mobileLabel || column.header)}`}>{column.header}{sort?.id === column.id ? sort.direction === 'asc' ? <ArrowUp size={11}/> : <ArrowDown size={11}/> : null}</button> : column.header}</th>)}</tr></thead>
          <tbody>{displayedRows.map(row => <tr key={getRowKey(row)}>{visible.map(column => <td key={column.id} className={`${column.pinned ? styles.pinned : ''} ${column.className || ''}`} data-align={column.align || 'left'}>{column.cell(row)}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <div className={styles.mobile}>{displayedRows.map(row => <article key={getRowKey(row)}>{visible.map((column, index) => <div key={column.id} data-primary={index === 0 ? 'true' : undefined}><small>{column.mobileLabel || column.header}</small><span>{column.cell(row)}</span></div>)}</article>)}</div>
      {limit < sortedRows.length && <button className={styles.more} type="button" onClick={() => setLimit(current => current + initialRowLimit)}>Show {Math.min(initialRowLimit, sortedRows.length - limit)} more</button>}
    </> : <div className={styles.empty}>{empty || 'No rows to display.'}</div>}
  </section>
}
