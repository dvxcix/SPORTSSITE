'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import styles from './ProductPage.module.css'

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

export function DateButtonNavigator({ date, today, onChange, label = 'Choose slate date' }: { date: string; today: string; onChange: (date: string) => void; label?: string }) {
  const dates = [-3, -2, -1, 0, 1, 2, 3].map(offset => {
    const value = offsetDate(date, offset)
    const parsed = new Date(`${value}T12:00:00Z`)
    return {
      value,
      selected: value === date,
      isToday: value === today,
      day: parsed.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      compact: parsed.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'UTC' }),
    }
  })

  return (
    <nav className={styles.dateNav} aria-label={label}>
      <button className={styles.dateArrow} type="button" onClick={() => onChange(offsetDate(date, -1))} aria-label="Previous day"><ChevronLeft size={18} /></button>
      {dates.map(item => (
        <button
          key={item.value}
          type="button"
          className={`${styles.dateCell} ${item.selected ? styles.dateCellSelected : ''}`}
          onClick={() => onChange(item.value)}
          aria-pressed={item.selected}
          title={item.isToday ? `${item.value}, today` : item.value}
        >
          <span className={styles.dateDay}>{item.isToday ? 'Today' : item.day}</span>
          <span className={styles.dateValue}>{item.compact}</span>
          {item.isToday && <span className={styles.todayDot} />}
        </button>
      ))}
      <button className={styles.dateArrow} type="button" onClick={() => onChange(offsetDate(date, 1))} aria-label="Next day"><ChevronRight size={18} /></button>
    </nav>
  )
}
