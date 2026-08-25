import { Suspense } from 'react'
import Link from 'next/link'
import { DugoutClient } from '@/components/dugout/DugoutClient'
import { TierGate } from '@/components/layout/TierGate'
import { PageState } from '@/components/layout/PageState'
import styles from './dugout-page.module.css'

export const revalidate = 0

function offsetDate(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().split('T')[0]
}

export default async function DugoutPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: dateParam } = await searchParams
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const date = dateParam ?? today
  const stripDates = [-3, -2, -1, 0, 1, 2, 3].map(offset => {
    const value = offsetDate(date, offset)
    const parsed = new Date(`${value}T12:00:00Z`)
    return {
      date: value,
      isSelected: value === date,
      isToday: value === today,
      dayName: parsed.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      dayNum: parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
    }
  })

  return (
    <TierGate requiredTier="free" label="The Dugout">
      <main className={styles.page}>
        <header className={`fade-in ${styles.hero}`}>
          <img src="/logo.png" alt="" className={styles.heroMark} />
          <div className={styles.heroCopy}>
            <h1 className={styles.heroTitle}>The Dugout <span className={styles.tier}>ULTIMATE</span></h1>
            <p className={styles.heroSubtitle}>Proprietary Game Matrix &middot; Built for game-by-game breakdown</p>
          </div>
          <Link href="/sports" className={styles.scores}>Scores</Link>
        </header>

        <nav className={styles.dateShell} aria-label="Choose slate date">
          <div className={styles.dateStrip}>
            <Link href={`/dugout?date=${offsetDate(date, -1)}`} className={styles.dateArrow} aria-label="Previous day">&larr;</Link>
            {stripDates.map(item => (
              <Link key={item.date} href={`/dugout?date=${item.date}`} className={styles.dateItem} data-selected={item.isSelected} data-today={item.isToday}>
                <span className={styles.dateDay}>{item.dayName}</span>
                <span className={styles.dateValue}>{item.dayNum}</span>
                {item.isToday && !item.isSelected && <span className={styles.todayDot} />}
              </Link>
            ))}
            <Link href={`/dugout?date=${offsetDate(date, 1)}`} className={styles.dateArrow} aria-label="Next day">&rarr;</Link>
          </div>
        </nav>

        <Suspense fallback={<PageState compact kind="loading" title="Loading The Dugout" message="Preparing the games, players, and market data." />}>
          <DugoutClient date={date} />
        </Suspense>
      </main>
    </TierGate>
  )
}
