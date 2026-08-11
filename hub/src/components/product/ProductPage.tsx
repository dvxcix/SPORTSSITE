import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import styles from './ProductPage.module.css'

export function ProductPageShell({ children, narrow = false, className = '' }: { children: ReactNode; narrow?: boolean; className?: string }) {
  return <main className={`${styles.shell} ${narrow ? styles.shellNarrow : ''} ${className}`}>{children}</main>
}

export function ProductHero({ icon, eyebrow, title, description, status, actions }: {
  icon: ReactNode
  eyebrow: string
  title: string
  description: string
  status?: string
  actions?: ReactNode
}) {
  return (
    <header className={styles.hero}>
      <div className={styles.heroIdentity}>
        <div className={styles.icon} aria-hidden="true">{icon}</div>
        <div>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.description}>{description}</p>
        </div>
      </div>
      {(status || actions) && (
        <div className={styles.actions}>
          {status && <span className={styles.status}><span className={styles.statusDot} />{status}</span>}
          {actions}
        </div>
      )}
    </header>
  )
}

export function ProductAction({ href, children }: { href: string; children: ReactNode }) {
  return <Link className={styles.action} href={href}>{children}</Link>
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

export function DateLinkNavigator({ date, today, basePath, label = 'Choose slate date' }: { date: string; today: string; basePath: string; label?: string }) {
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
      <Link className={styles.dateArrow} href={`${basePath}?date=${offsetDate(date, -1)}`} aria-label="Previous day"><ChevronLeft size={18} /></Link>
      {dates.map(item => (
        <Link
          key={item.value}
          className={`${styles.dateCell} ${item.selected ? styles.dateCellSelected : ''}`}
          href={`${basePath}?date=${item.value}`}
          aria-current={item.selected ? 'date' : undefined}
          title={item.isToday ? `${item.value}, today` : item.value}
        >
          <span className={styles.dateDay}>{item.isToday ? 'Today' : item.day}</span>
          <span className={styles.dateValue}>{item.compact}</span>
          {item.isToday && <span className={styles.todayDot} />}
        </Link>
      ))}
      <Link className={styles.dateArrow} href={`${basePath}?date=${offsetDate(date, 1)}`} aria-label="Next day"><ChevronRight size={18} /></Link>
    </nav>
  )
}

export function ProductPanel({ children, padded = false, className = '' }: { children: ReactNode; padded?: boolean; className?: string }) {
  return <section className={`${styles.panel} ${padded ? styles.panelPad : ''} ${className}`}>{children}</section>
}

export function ProductSectionHeader({ title, meta }: { title: string; meta?: string }) {
  return <div className={styles.sectionHeader}><h2 className={styles.sectionTitle}>{title}</h2>{meta && <span className={styles.sectionMeta}>{meta}</span>}</div>
}
