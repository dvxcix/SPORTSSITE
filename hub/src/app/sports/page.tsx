import { getScoreboard, getGameStatus } from '@/lib/espn-api'
import type { SportKey } from '@/lib/espn-api'
import { getMLBSchedule, mlbGameIsLive } from '@/lib/mlb-api'
import { GameCard, GameCardCompact } from '@/components/sports/GameCard'
import { MLBScoreRow } from '@/components/sports/MLBScoreRow'
import { LocalDateRedirect } from '@/components/LocalDateRedirect'
import Link from 'next/link'
import { cookies } from 'next/headers'

export const revalidate = 30

// ─── Season windows ──────────────────────────────────────────────
type SeasonDef = { sm: number; sd: number; em: number; ed: number; wraps?: boolean }

const SEASON_DEFS: Record<string, SeasonDef> = {
  nfl:    { sm: 8,  sd: 1,  em: 2,  ed: 15, wraps: true  },
  nba:    { sm: 10, sd: 1,  em: 6,  ed: 25, wraps: true  },
  nhl:    { sm: 10, sd: 7,  em: 6,  ed: 25, wraps: true  },
  mlb:    { sm: 3,  sd: 20, em: 11, ed: 15               },
  soccer: { sm: 2,  sd: 25, em: 12, ed: 1                },
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
      const start = ms(startYear, def.sm, def.sd)
      const end = ms(startYear + 1, def.em, def.ed)
      if (t >= start - pre && t <= end + post) return true
    }
    return false
  }
  const start = ms(y, def.sm, def.sd)
  const end = ms(y, def.em, def.ed)
  return t >= start - pre && t <= end + post
}

// ─── Date helpers ────────────────────────────────────────────────
function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

const NON_MLB_SPORTS: { key: SportKey; label: string; emoji: string }[] = [
  { key: 'nfl',    label: 'NFL',  emoji: '🏈' },
  { key: 'nba',    label: 'NBA',  emoji: '🏀' },
  { key: 'nhl',    label: 'NHL',  emoji: '🏒' },
  { key: 'soccer', label: 'MLS',  emoji: '⚽' },
]

export default async function SportsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date: dateParam } = await searchParams
  // No date param yet: the server can only guess "today" from its own clock
  // (UTC on Vercel), which is wrong for any viewer not in UTC. Redirect
  // client-side so the URL gets pinned to the VIEWER's own local date instead.
  if (!dateParam) return <LocalDateRedirect basePath="/sports" />

  // Prefer the cookie LocalDateRedirect stamped with the viewer's own local
  // date; only fall back to the server's UTC clock if it's not set yet
  // (first-ever page load before any client JS has run).
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

  // 7-day strip centered on selected date
  const stripDates = [-3, -2, -1, 0, 1, 2, 3].map(offset => {
    const d = offsetDate(date, offset)
    const dt = new Date(d + 'T12:00:00Z')
    return {
      date: d,
      isSelected: d === date,
      isToday: d === today,
      dayName: dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      // Day number only (no month) — "Jul 12" doesn't fit in a 7-across strip
      // on a 375px phone without overflowing; the day name above it plus the
      // "today" dot/highlight is enough context outside month boundaries.
      dayNum: dt.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' }),
    }
  })

  const prevDate = offsetDate(date, -1)
  const nextDate = offsetDate(date, 1)

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '20px 16px' }}>

      {/* 7-day date strip */}
      <div style={{ display: 'flex', alignItems: 'stretch', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
        {/* Prev arrow */}
        <Link href={`/sports?date=${prevDate}`} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 36, flexShrink: 0, textDecoration: 'none',
          color: 'var(--text-3)', fontSize: 18, fontWeight: 700,
          borderRight: '1px solid var(--border)',
          transition: 'color 120ms, background 120ms',
        }}>‹</Link>

        {/* Days */}
        {stripDates.map(({ date: d, isSelected, isToday, dayName, dayNum }) => (
          <Link
            key={d}
            href={`/sports?date=${d}`}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '10px 4px', textDecoration: 'none', gap: 3,
              background: isSelected ? 'var(--accent)' : 'transparent',
              borderRight: '1px solid var(--border)',
              transition: 'background 120ms',
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, color: isSelected ? 'var(--accent-fg)' : isToday ? 'var(--accent)' : 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {dayName}
            </span>
            <span style={{ fontSize: 12, fontWeight: isSelected || isToday ? 900 : 600, color: isSelected ? 'var(--accent-fg)' : 'var(--text-1)', whiteSpace: 'nowrap' }}>
              {dayNum}
            </span>
            {isToday && !isSelected && (
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', display: 'block' }} />
            )}
          </Link>
        ))}

        {/* Next arrow */}
        <Link href={`/sports?date=${nextDate}`} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 36, flexShrink: 0, textDecoration: 'none',
          color: 'var(--text-3)', fontSize: 18, fontWeight: 700,
          transition: 'color 120ms, background 120ms',
        }}>›</Link>
      </div>

      {/* MLB section */}
      {mlbActive && mlbGames.length > 0 && (() => {
        const live = mlbGames.filter(mlbGameIsLive)
        const notLive = mlbGames.filter(g => !mlbGameIsLive(g))
        return (
          <section style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 18 }}>⚾</span>
              <h2 style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>MLB</h2>
              {live.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 99, background: 'rgba(255,77,106,0.12)', color: 'var(--red)', border: '1px solid rgba(255,77,106,0.25)' }}>
                  {live.length} LIVE
                </span>
              )}
              <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 'auto' }}>{mlbGames.length} games</span>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              {/* Column headers */}
              <div style={{ display: 'flex', alignItems: 'center', padding: '7px 16px 7px 30px', borderBottom: '1px solid var(--border)', gap: 0 }}>
                <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Away</span>
                <span className="w-[64px] sm:w-[100px]" style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</span>
                <span className="pr-3 sm:pr-[90px]" style={{ flex: 1, textAlign: 'right', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Home</span>
              </div>
              {/* Live games first */}
              {live.map(g => <MLBScoreRow key={g.gamePk} game={g} />)}
              {notLive.map(g => <MLBScoreRow key={g.gamePk} game={g} />)}
            </div>
          </section>
        )
      })()}

      {/* ESPN sports */}
      {activeNonMLB.map(({ key, label, emoji }, i) => {
        const games = espnResults[i] ?? []
        if (games.length === 0) return null
        const live = games.filter(g => getGameStatus(g).isLive)
        const rest = games.filter(g => !getGameStatus(g).isLive)
        return (
          <section key={key} style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 18 }}>{emoji}</span>
              <h2 style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>{label}</h2>
              {live.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 99, background: 'rgba(255,77,106,0.12)', color: 'var(--red)', border: '1px solid rgba(255,77,106,0.25)' }}>
                  {live.length} LIVE
                </span>
              )}
              <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 'auto' }}>{games.length} games</span>
            </div>
            {live.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10, marginBottom: 10 }}>
                {live.map(g => <GameCard key={g.id} game={g} sport={key} />)}
              </div>
            )}
            {rest.length > 0 && (
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                {rest.map(g => <GameCardCompact key={g.id} game={g} sport={key} />)}
              </div>
            )}
          </section>
        )
      })}

      {/* Empty state */}
      {mlbGames.length === 0 && espnResults.every(r => r.length === 0) && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>🏟️</p>
          <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-2)', marginBottom: 6 }}>No games scheduled</p>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>Try a different date</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <Link href={`/sports?date=${prevDate}`} style={{ padding: '8px 18px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>← Yesterday</Link>
            <Link href={`/sports?date=${nextDate}`} style={{ padding: '8px 18px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Tomorrow →</Link>
          </div>
        </div>
      )}
    </div>
  )
}
