'use client'

import { BookLogo, normalizeVendor } from './BookLogo'
import styles from './SportsbookMark.module.css'

const DEFAULT_BOOKS = ['fanduel', 'draftkings', 'betmgm']
const LOCAL_BOOKS = new Set([...DEFAULT_BOOKS, 'caesars', 'betrivers', 'pinnacle', 'fanatics', 'betparx', 'ballybet'])

/** Decorative identity for a sportsbook control; its parent supplies the accessible label. */
export function SportsbookMark({ vendor = 'all', books = [], size = 30 }: { vendor?: string; books?: readonly string[]; size?: number }) {
  if (vendor && vendor !== 'all') return <span aria-hidden="true" className={styles.single}><BookLogo vendor={vendor} size={size}/></span>
  const available = [...new Set(books.map(normalizeVendor))].filter(book => LOCAL_BOOKS.has(book))
  const visible = (available.length ? [...DEFAULT_BOOKS.filter(book => available.includes(book)), ...available.filter(book => !DEFAULT_BOOKS.includes(book))] : DEFAULT_BOOKS).slice(0, 3)
  if (visible.length === 1) return <span aria-hidden="true" className={styles.single}><BookLogo vendor={visible[0]} size={size}/></span>
  const tile = size * .64, gap = (size - tile) / (visible.length - 1)
  return <span aria-hidden="true" className={styles.stack} style={{ width: size, height: size }} data-sportsbook-mark="all">
    {visible.map((book, index) => <span key={book} className={styles.tile} style={{ width: tile, height: tile, left: index * gap, bottom: index * gap, zIndex: index + 1 }}><BookLogo vendor={book} size={tile - 3}/></span>)}
  </span>
}
