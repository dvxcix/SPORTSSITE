'use client'

import { useEffect, useRef } from 'react'
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import type { PaintGame } from '@/lib/nbaPaint'
import { TeamLogo } from './PaintVisuals'
import styles from './slateHeader.module.css'

const dayFormat = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' })
const monthFormat = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const timeFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })

export function paintSlateDay(date: string, direction: number) {
  const next = new Date(`${date}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate() + direction)
  return next.toISOString().slice(0, 10)
}

function gameTime(game: PaintGame) {
  if (game.status_state === 'final') return 'Final'
  if (game.status_state === 'in_progress') return 'Live'
  const timestamp = Date.parse(game.datetime ?? game.status)
  return Number.isFinite(timestamp) ? timeFormat.format(timestamp) : 'Time TBD'
}

export function PaintSlateHeader({ date, days, games, gameId, onChange }: {
  date: string
  days: string[]
  games: PaintGame[]
  gameId?: number
  onChange: (date: string, gameId?: number) => void
}) {
  const activeDay = useRef<HTMLButtonElement>(null)
  const activeGame = useRef<HTMLButtonElement>(null)
  const slateDays = [...new Set([...days, date])].sort()
  useEffect(() => {
    const active = activeDay.current, rail = active?.parentElement
    if (active && rail) rail.scrollLeft = active.offsetLeft - rail.offsetLeft - (rail.clientWidth - active.clientWidth) / 2
  }, [date])
  useEffect(() => {
    const active = activeGame.current, rail = active?.parentElement
    if (active && rail) rail.scrollLeft = active.offsetLeft - rail.offsetLeft
  }, [gameId])

  return <section className={styles.slate} aria-label="NBA slate">
    <div className={styles.dateRow}>
      <label className={styles.calendar}>
        <CalendarDays size={17}/>
        <span>{monthFormat.format(new Date(`${date}T12:00:00Z`))}</span>
        <ChevronDown size={13}/>
        <input type="date" aria-label="Slate date" value={date} onChange={event => { if (event.target.value) onChange(event.target.value) }}/>
      </label>
      <div className={styles.dateNavigation}>
        <button type="button" className={styles.arrow} aria-label="Previous slate day" onClick={() => onChange(paintSlateDay(date, -1))}><ChevronLeft size={17}/></button>
        <nav className={styles.days} aria-label="NBA slate dates">
          {slateDays.map(day => <button type="button" key={day} ref={day === date ? activeDay : undefined} aria-pressed={day === date} aria-label={new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} onClick={() => onChange(day)}>
            <small>{dayFormat.format(new Date(`${day}T12:00:00Z`))}</small><strong>{Number(day.slice(-2))}</strong>
          </button>)}
        </nav>
        <button type="button" className={styles.arrow} aria-label="Next slate day" onClick={() => onChange(paintSlateDay(date, 1))}><ChevronRight size={17}/></button>
      </div>
    </div>
    {games.length > 0 && <div className={styles.gamesRow}>
      <div className={styles.slateLabel}><span>{games.length} {games.length === 1 ? 'GAME' : 'GAMES'}</span><small>ALL TIMES ET</small></div>
      <nav className={styles.games} aria-label="NBA matchups">
        {games.map(game => {
          const selected = game.id === gameId
          const hasScore = ['final', 'in_progress'].includes(game.status_state ?? '')
          return <button type="button" key={game.id} ref={selected ? activeGame : undefined} className={styles.game} aria-pressed={selected} aria-label={`${game.visitor_team.full_name} at ${game.home_team.full_name}, ${gameTime(game)}${hasScore ? `, ${game.visitor_team_score} to ${game.home_team_score}` : ' Eastern'}`} onClick={() => onChange(game.date, game.id)}>
            <span className={styles.teams}><TeamLogo abbr={game.visitor_team.abbreviation} size={36}/><span className={styles.score}>{hasScore ? <><b>{game.visitor_team_score}</b><i>–</i><b>{game.home_team_score}</b></> : <i className={styles.versus}>vs</i>}</span><TeamLogo abbr={game.home_team.abbreviation} size={36}/></span>
            <span className={styles.gameTime} data-live={game.status_state === 'in_progress'}>{game.status_state === 'in_progress' && <i/>}{gameTime(game)}</span>
            {selected && <Check className={styles.selected} size={11}/>} 
          </button>
        })}
      </nav>
    </div>}
  </section>
}
