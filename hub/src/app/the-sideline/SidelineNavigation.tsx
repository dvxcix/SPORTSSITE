'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import type { SidelineGame } from './types'
import styles from './sidelineNavigation.module.css'
import { scheduleWeekKey, scheduleWeekLabel, type SidelineScheduleDay } from './scheduleNavigation'

const sections = [['', 'The Sideline'], ['cheatsheets', 'Cheatsheets'], ['public', 'The Public'], ['markets', 'Sportsbooks'], ['research', 'Matchup Lab'], ['film', 'Play Explorer']] as const

export function SidelineNavigation({ games, days, selected, sample, mode }: { games: SidelineGame[]; days: SidelineScheduleDay[]; selected: SidelineGame; sample: string; mode: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const href = (section: string, game = selected.id, date = selected.gameday, reference = sample) => `/the-sideline?${new URLSearchParams({ game, date, sample: reference, ...(section ? { mode: section } : {}) })}`
  const change = (url: string) => startTransition(() => router.push(url, { scroll: false }))
  const selectedDay = { ...selected, date: selected.gameday }
  const weekKey = scheduleWeekKey(selectedDay)
  const weeks = [...new Map(days.map(day => [scheduleWeekKey(day), day])).values()]
  const weekDays = days.filter(day => scheduleWeekKey(day) === weekKey)
  return <section className={styles.shell} aria-label="NFL workspace" aria-busy={pending}>
    <div className={styles.context}>
      <span className={styles.brand}>NFL</span>
      <label>Week<select aria-label="NFL week" value={weekKey} disabled={pending} onChange={event => { const day = days.find(day => scheduleWeekKey(day) === event.target.value); if (day) change(href(mode, '', day.date)) }}>{weeks.map(day => <option key={scheduleWeekKey(day)} value={scheduleWeekKey(day)}>{scheduleWeekLabel(day)}</option>)}</select></label>
      <label>Game day<select aria-label="NFL game day" value={selected.gameday} disabled={pending} onChange={event => change(href(mode, '', event.target.value))}>{weekDays.map(day => <option key={day.date} value={day.date}>{new Date(`${day.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}</option>)}</select></label>
      <label>Game<select value={selected.id} disabled={pending} onChange={event => change(href(mode, event.target.value))}>{games.map(game => <option key={game.id} value={game.id}>{game.away.abbr} @ {game.home.abbr}</option>)}</select></label>
      <label>Stat sample<select value={sample} disabled={pending} onChange={event => change(href(mode, selected.id, selected.gameday, event.target.value))}><option value="previous">{selected.season - 1} season</option><option value="preseason">{selected.season} preseason</option><option value="regular">{selected.season} season</option></select></label>
    </div>
    <nav className={styles.tabs} aria-label="NFL sections">{sections.map(([key, label]) => <Link key={key} prefetch={false} aria-current={mode === key ? 'page' : undefined} href={href(key)}>{label}</Link>)}</nav>
  </section>
}
