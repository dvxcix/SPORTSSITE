'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import type { SidelineGame } from './types'
import styles from './sidelineNavigation.module.css'

const sections = [['', 'The Sideline'], ['public', 'The Public'], ['markets', 'Sportsbooks'], ['research', 'Matchup Lab'], ['film', 'Play Explorer']] as const

export function SidelineNavigation({ games, selected, sample, mode }: { games: SidelineGame[]; selected: SidelineGame; sample: string; mode: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const href = (section: string, game = selected.id, date = selected.gameday, reference = sample) => `/the-sideline?${new URLSearchParams({ game, date, sample: reference, ...(section ? { mode: section } : {}) })}`
  const change = (url: string) => startTransition(() => router.push(url, { scroll: false }))
  return <section className={styles.shell} aria-label="NFL workspace" aria-busy={pending}>
    <div className={styles.context}>
      <span className={styles.brand}>NFL</span>
      <label>Date<input type="date" value={selected.gameday} disabled={pending} onChange={event => { if (event.target.value) change(href(mode, '', event.target.value)) }} /></label>
      <label>Game<select value={selected.id} disabled={pending} onChange={event => change(href(mode, event.target.value))}>{games.map(game => <option key={game.id} value={game.id}>{game.away.abbr} @ {game.home.abbr}</option>)}</select></label>
      <label>Stat sample<select value={sample} disabled={pending} onChange={event => change(href(mode, selected.id, selected.gameday, event.target.value))}><option value="previous">{selected.season - 1} season</option><option value="preseason">{selected.season} preseason</option><option value="regular">{selected.season} season</option></select></label>
    </div>
    <nav className={styles.tabs} aria-label="NFL sections">{sections.map(([key, label]) => <Link key={key} prefetch={false} aria-current={mode === key ? 'page' : undefined} href={href(key)}>{label}</Link>)}</nav>
  </section>
}
