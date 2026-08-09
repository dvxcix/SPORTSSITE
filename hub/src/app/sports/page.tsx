import { getScoreboard, getGameStatus } from '@slipsurge/core/espn-api'
import type { SportKey } from '@slipsurge/core/espn-api'
import { getMLBSchedule, mlbGameIsLive } from '@slipsurge/core/mlb-api'
import { GameCard } from '@/components/sports/GameCard'
import { MLBScoreRow } from '@/components/sports/MLBScoreRow'
import { LocalDateRedirect } from '@/components/LocalDateRedirect'
import { CalendarDays, ChevronLeft, ChevronRight, Radio, Trophy } from 'lucide-react'
import Link from 'next/link'
import { cookies } from 'next/headers'

export const revalidate = 30

type SeasonDef = { sm: number; sd: number; em: number; ed: number; wraps?: boolean }

const SEASON_DEFS: Record<string, SeasonDef> = {
  nfl: { sm: 8, sd: 1, em: 2, ed: 15, wraps: true },
  nba: { sm: 10, sd: 1, em: 6, ed: 25, wraps: true },
  nhl: { sm: 10, sd: 7, em: 6, ed: 25, wraps: true },
  mlb: { sm: 3, sd: 20, em: 11, ed: 15 },
  soccer: { sm: 2, sd: 25, em: 12, ed: 1 },
}

function isSeasonActive(sport: string, date: Date): boolean {
  const def = SEASON_DEFS[sport]
  if (!def) return true
  const y = date.getFullYear()
  const ms = (yr: number, m: number, d: number) => new Date(yr, m - 1, d).getTime()
  const t = date.getTime()
  const pre = 10 * 86_400_000
  const post = 3 * 86_400_000
  if (def.wraps) {
    for (const startYear of [y - 1, y]) {
      if (t >= ms(startYear, def.sm, def.sd) - pre && t <= ms(startYear + 1, def.em, def.ed) + post) return true
    }
    return false
  }
  return t >= ms(y, def.sm, def.sd) - pre && t <= ms(y, def.em, def.ed) + post
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

const NON_MLB_SPORTS: { key: SportKey; label: string; name: string }[] = [
  { key: 'nfl', label: 'NFL', name: 'National Football League' },
  { key: 'nba', label: 'NBA', name: 'National Basketball Association' },
  { key: 'nhl', label: 'NHL', name: 'National Hockey League' },
  { key: 'soccer', label: 'MLS', name: 'Major League Soccer' },
]

export default async function SportsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: dateParam } = await searchParams
  if (!dateParam) return <LocalDateRedirect basePath="/sports" />

  const cookieStore = await cookies()
  const today = cookieStore.get('local_date')?.value ?? new Date().toISOString().split('T')[0]
  const date = dateParam
  const checkDate = new Date(date + 'T12:00:00Z')
  const mlbActive = isSeasonActive('mlb', checkDate)
  const activeNonMLB = NON_MLB_SPORTS.filter(({ key }) => isSeasonActive(key, checkDate))
  const [mlbGames, ...espnResults] = await Promise.all([
    mlbActive ? getMLBSchedule(date) : Promise.resolve([]),
    ...activeNonMLB.map(({ key }) => getScoreboard(key, date)),
  ])

  const stripDates = [-3, -2, -1, 0, 1, 2, 3].map(offset => {
    const stripDate = offsetDate(date, offset)
    const dt = new Date(stripDate + 'T12:00:00Z')
    return {
      date: stripDate,
      isSelected: stripDate === date,
      isToday: stripDate === today,
      dayName: dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      dayNum: dt.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' }),
    }
  })

  const prevDate = offsetDate(date, -1)
  const nextDate = offsetDate(date, 1)
  const totalGames = mlbGames.length + espnResults.reduce((sum, games) => sum + games.length, 0)
  const totalLive = mlbGames.filter(mlbGameIsLive).length + espnResults.reduce((sum, games) => sum + games.filter(g => getGameStatus(g).isLive).length, 0)
  const selectedDateLabel = checkDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

  return (
    <main className="ss-scores-page">
      <section className="ss-scores-hero">
        <div className="ss-scores-hero-copy">
          <span className="ss-scores-kicker"><Radio size={13} /> Score center</span>
          <h1>Live Scores</h1>
          <p>Every game, every moment, all in one place.</p>
        </div>
        <div className="ss-scores-summary" aria-label="Scoreboard summary">
          <div><strong>{totalLive}</strong><span>Live now</span></div>
          <div><strong>{totalGames}</strong><span>Games</span></div>
          <div className="ss-scores-summary-date"><CalendarDays size={16} /><span>{selectedDateLabel}</span></div>
        </div>
      </section>

      <nav className="ss-scores-sport-nav" aria-label="Sports on this date">
        {mlbActive && <a href="#scores-mlb">MLB <span>{mlbGames.length}</span></a>}
        {activeNonMLB.map(({ key, label }, i) => (
          <a key={key} href={`#scores-${key}`}>{label} <span>{espnResults[i]?.length ?? 0}</span></a>
        ))}
      </nav>

      <div className="ss-scores-date-strip">
        <Link href={`/sports?date=${prevDate}`} className="ss-scores-date-arrow" aria-label="Previous day"><ChevronLeft size={18} /></Link>
        {stripDates.map(({ date: stripDate, isSelected, isToday, dayName, dayNum }) => (
          <Link key={stripDate} href={`/sports?date=${stripDate}`} className="ss-scores-date" data-selected={isSelected} data-today={isToday}>
            <span>{dayName}</span><strong>{dayNum}</strong>{isToday && <small>Today</small>}
          </Link>
        ))}
        <Link href={`/sports?date=${nextDate}`} className="ss-scores-date-arrow" aria-label="Next day"><ChevronRight size={18} /></Link>
      </div>

      {mlbActive && mlbGames.length > 0 && (() => {
        const live = mlbGames.filter(mlbGameIsLive)
        const rest = mlbGames.filter(game => !mlbGameIsLive(game))
        return (
          <section id="scores-mlb" className="ss-scores-league">
            <LeagueHeader label="MLB" name="Major League Baseball" live={live.length} games={mlbGames.length} />
            <div className="ss-scores-board">
              <div className="ss-scores-column-headings"><span>Away</span><span>Status</span><span>Home</span></div>
              {live.map(game => <MLBScoreRow key={game.gamePk} game={game} />)}
              {rest.map(game => <MLBScoreRow key={game.gamePk} game={game} />)}
            </div>
          </section>
        )
      })()}

      {activeNonMLB.map(({ key, label, name }, i) => {
        const games = espnResults[i] ?? []
        if (games.length === 0) return null
        const live = games.filter(game => getGameStatus(game).isLive)
        const rest = games.filter(game => !getGameStatus(game).isLive)
        return (
          <section id={`scores-${key}`} key={key} className="ss-scores-league">
            <LeagueHeader label={label} name={name} live={live.length} games={games.length} />
            <div className="ss-scores-card-grid">
              {live.map(game => <GameCard key={game.id} game={game} sport={key} />)}
              {rest.map(game => <GameCard key={game.id} game={game} sport={key} />)}
            </div>
          </section>
        )
      })}

      {totalGames === 0 && (
        <section className="ss-scores-empty">
          <div><Trophy size={24} /></div><h2>No games scheduled</h2><p>Try another day to see the full scoreboard.</p>
          <nav><Link href={`/sports?date=${prevDate}`}><ChevronLeft size={15} /> Yesterday</Link><Link href={`/sports?date=${nextDate}`}>Tomorrow <ChevronRight size={15} /></Link></nav>
        </section>
      )}
    </main>
  )
}

function LeagueHeader({ label, name, live, games }: { label: string; name: string; live: number; games: number }) {
  return (
    <div className="ss-scores-league-header">
      <div className="ss-scores-league-mark"><Trophy size={16} /></div>
      <div><h2>{label}</h2><p>{name}</p></div>
      {live > 0 && <span className="ss-scores-live-count"><i />{live} live</span>}
      <span className="ss-scores-game-count">{games} game{games === 1 ? '' : 's'}</span>
    </div>
  )
}
