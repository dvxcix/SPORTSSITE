'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition, type CSSProperties, type ComponentType } from 'react'
import { ChartNoAxesCombined, ChevronDown, Film, LayoutDashboard, ScanSearch, Shield, UsersRound } from 'lucide-react'
import type { SidelineGame, SidelineTeam } from './types'
import styles from './sidelineNavigation.module.css'
import { scheduleWeekKey, scheduleWeekLabel, type SidelineScheduleDay } from './scheduleNavigation'

const sections: ReadonlyArray<{ key: string; label: string; Icon: ComponentType<{ size?: number }> }> = [
  { key: '', label: 'The Sideline', Icon: LayoutDashboard },
  { key: 'cheatsheets', label: 'Cheatsheets', Icon: ScanSearch },
  { key: 'public', label: 'The Public', Icon: UsersRound },
  { key: 'markets', label: 'Sportsbooks', Icon: ChartNoAxesCombined },
  { key: 'research', label: 'Matchup Lab', Icon: Shield },
  { key: 'film', label: 'Play Explorer', Icon: Film },
]

function shortDay(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function gameStatus(game: SidelineGame) {
  if (game.awayScore != null && game.homeScore != null) return `${game.awayScore}–${game.homeScore} · Final`
  return game.gametime ? `${game.gametime} ET` : 'Time TBD'
}

function NavigationTeamLogo({ team }: { team: SidelineTeam }) {
  const [failed, setFailed] = useState(false)
  if (team.logo && !failed) return <Image unoptimized src={team.logo} alt={`${team.name} logo`} width={32} height={32} onError={() => setFailed(true)} />
  return <span style={{ '--team-color': team.color } as CSSProperties}>{team.abbr.slice(0, 2)}</span>
}

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
    <header className={styles.topBar}>
      <div className={styles.identity}>
        <span className={styles.nflMark}>NFL</span>
        <div><strong>Football Intelligence</strong><small>{scheduleWeekLabel(selectedDay)}</small></div>
      </div>
      <div className={styles.contextControls}>
        <label className={styles.selectControl}>
          <span>Week</span>
          <span><select aria-label="NFL week" value={weekKey} disabled={pending} onChange={event => { const day = days.find(item => scheduleWeekKey(item) === event.target.value); if (day) change(href(mode, '', day.date)) }}>{weeks.map(day => <option key={scheduleWeekKey(day)} value={scheduleWeekKey(day)}>{scheduleWeekLabel(day)}</option>)}</select><ChevronDown size={14} /></span>
        </label>
        <label className={styles.selectControl}>
          <span>Stat sample</span>
          <span><select aria-label="NFL stat sample" value={sample} disabled={pending} onChange={event => change(href(mode, selected.id, selected.gameday, event.target.value))}><option value="previous">{selected.season - 1} season</option><option value="preseason">{selected.season} preseason</option><option value="regular">{selected.season} season</option></select><ChevronDown size={14} /></span>
        </label>
      </div>
    </header>

    <div className={styles.schedulePicker}>
      <nav className={styles.dayRail} aria-label="NFL game days">
        {weekDays.map(day => {
          const [weekday, date] = shortDay(day.date).split(', ')
          return <button key={day.date} type="button" aria-current={day.date === selected.gameday ? 'date' : undefined} disabled={pending} onClick={() => change(href(mode, '', day.date))}><small>{weekday}</small><strong>{date}</strong></button>
        })}
      </nav>
      <div className={styles.gamePicker}>
        <div className={styles.gamePickerTitle}><span>Games</span><b>{games.length}</b></div>
        <div className={styles.gameCards}>
          {games.map(game => <button key={game.id} type="button" className={game.id === selected.id ? styles.gameActive : ''} disabled={pending} aria-pressed={game.id === selected.id} onClick={() => change(href(mode, game.id, game.gameday))} style={{ '--away-color': game.away.color, '--home-color': game.home.color } as CSSProperties}>
            <span className={styles.matchupLogos}><NavigationTeamLogo team={game.away} /><i>@</i><NavigationTeamLogo team={game.home} /></span>
            <span className={styles.matchupNames}><strong>{game.away.abbr}</strong><i>at</i><strong>{game.home.abbr}</strong></span>
            <small>{gameStatus(game)}</small>
          </button>)}
        </div>
      </div>
    </div>

    <nav className={styles.tabs} aria-label="NFL sections">
      {sections.map(({ key, label, Icon }) => <Link key={key} prefetch={false} aria-current={mode === key ? 'page' : undefined} href={href(key)}><Icon size={15} /><span>{label}</span></Link>)}
    </nav>
    {pending ? <span className={styles.progress} aria-hidden="true" /> : null}
  </section>
}
