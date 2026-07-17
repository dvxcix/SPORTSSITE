'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, TrendingUp, BarChart2, List } from 'lucide-react'
import type { ESPNGame, ESPNSummary, ESPNPlay, SportKey } from '@/lib/espn-api'
import { getGameStatus } from '@/lib/espn-api'
import { PlayerAvatar, TeamLogo } from '@/components/sports/PlayerAvatar'
import { PostCardClient } from '@/components/social/PostCardClient'

type Reactions = Record<string, Record<string, { count: number; mine: boolean }>>
type TeamInfo = { id: string; logo: string; color: string; altColor: string; abbr: string; name: string }

const EMOJIS = ['🔥', '💯', '🤯', '😤', '😱', '👏', '💀', '🎯']

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/** Build a teamId → TeamInfo map from summary competitors */
function buildTeamMap(summary: ESPNSummary | null, game: ESPNGame | null): Record<string, TeamInfo> {
  const map: Record<string, TeamInfo> = {}
  const comps = summary?.header?.competitions?.[0]?.competitors
    ?? game?.competitions?.[0]?.competitors
    ?? []
  for (const c of comps) {
    const t = (c as any).team
    if (t?.id) {
      map[t.id] = {
        id: t.id,
        logo: t.logo ?? '',
        color: t.color ?? '',
        altColor: t.alternateColor ?? '',
        abbr: t.abbreviation ?? t.shortDisplayName ?? '',
        name: t.displayName ?? t.name ?? '',
      }
    }
  }
  return map
}

/** Build athlete id → { headshot, teamLogo, name } from boxscore.players */
function buildAthleteMap(summary: ESPNSummary | null, teamMap: Record<string, TeamInfo>): Record<string, { headshot?: string; teamLogo?: string; name: string }> {
  const map: Record<string, { headshot?: string; teamLogo?: string; name: string }> = {}
  const players = summary?.boxscore?.players ?? []
  for (const teamPlayers of players) {
    // find team logo — match by abbreviation
    const teamLogo = Object.values(teamMap).find(t => t.abbr === teamPlayers.team?.abbreviation)?.logo
    for (const statGroup of teamPlayers.statistics ?? []) {
      for (const entry of statGroup.athletes ?? []) {
        const a = entry.athlete
        if (a?.displayName) {
          map[a.displayName] = {
            headshot: a.headshot?.href,
            teamLogo,
            name: a.displayName,
          }
        }
      }
    }
  }
  // Also pull from leaders
  for (const teamGroup of summary?.leaders ?? []) {
    const teamLogo = teamGroup.team?.logo
    for (const cat of teamGroup.leaders ?? []) {
      for (const ldr of cat.leaders ?? []) {
        const name = ldr.athlete?.displayName
        if (name && !map[name]) {
          map[name] = { headshot: ldr.athlete?.headshot?.href, teamLogo, name }
        }
      }
    }
  }
  return map
}

// ─── Scoreboard ───────────────────────────────────────────────────
function Scoreboard({ summary, game, gameStatus, isLive }: {
  summary: ESPNSummary | null
  game: ESPNGame | null
  gameStatus: { state: string; label: string; isLive: boolean }
  isLive: boolean
}) {
  const comp = summary?.header?.competitions?.[0] ?? game?.competitions?.[0]
  if (!comp) return null
  const competitors = (comp as any).competitors ?? []
  const away = competitors.find((c: any) => c.homeAway === 'away')
  const home = competitors.find((c: any) => c.homeAway === 'home')
  const status = (comp as any).status ?? {}
  const odds = (comp as any).odds?.[0]
  const venue = (comp as any).venue
  const stateStr = status?.type?.state ?? gameStatus.state
  const period = status?.period ?? status?.type?.period
  const clock = status?.displayClock ?? status?.type?.displayClock

  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${isLive ? 'rgba(255,77,106,0.35)' : 'var(--border)'}`,
      borderRadius: 18, padding: '24px 20px', marginBottom: 4,
    }}>
      {/* Status badge */}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <span style={{
          fontSize: 12, fontWeight: 800, letterSpacing: '0.06em',
          color: isLive ? 'var(--red)' : stateStr === 'post' ? 'var(--text-3)' : 'var(--accent)',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          {isLive && (
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }} />
          )}
          {stateStr === 'in'
            ? `${period ? `${period && ['Q', 'P', 'H'].includes('') ? `Q${period}` : period} · ` : ''}${clock ?? ''}`
            : gameStatus.label}
        </span>
      </div>

      {/* Away – Score – Home */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8 }}>
        {/* Away team */}
        <div style={{ textAlign: 'center' }}>
          {away?.team?.logo && (
            <img
              src={away.team.logo}
              alt=""
              style={{ width: 68, height: 68, objectFit: 'contain', margin: '0 auto 10px', display: 'block' }}
            />
          )}
          <p style={{ fontSize: 17, fontWeight: 900, color: 'var(--text-1)', lineHeight: 1.1 }}>
            {away?.team?.shortDisplayName ?? away?.team?.abbreviation}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{away?.records?.[0]?.summary}</p>
        </div>

        {/* Score */}
        <div style={{ textAlign: 'center', minWidth: 120 }}>
          {stateStr === 'pre' ? (
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-3)' }}>vs</p>
          ) : (
            <p style={{
              fontSize: 54, fontWeight: 900, color: 'var(--text-1)',
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.04em', lineHeight: 1,
            }}>
              {away?.score ?? 0}
              <span style={{ color: 'var(--border-2)', fontSize: 36, margin: '0 6px' }}>–</span>
              {home?.score ?? 0}
            </p>
          )}
        </div>

        {/* Home team */}
        <div style={{ textAlign: 'center' }}>
          {home?.team?.logo && (
            <img
              src={home.team.logo}
              alt=""
              style={{ width: 68, height: 68, objectFit: 'contain', margin: '0 auto 10px', display: 'block' }}
            />
          )}
          <p style={{ fontSize: 17, fontWeight: 900, color: 'var(--text-1)', lineHeight: 1.1 }}>
            {home?.team?.shortDisplayName ?? home?.team?.abbreviation}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{home?.records?.[0]?.summary}</p>
        </div>
      </div>

      {/* Odds */}
      {odds && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'center', gap: 32 }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Spread</p>
            <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>{odds.details}</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>O/U</p>
            <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>{odds.overUnder}</p>
          </div>
        </div>
      )}

      {/* Meta */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, marginTop: 10 }}>
        {venue && (
          <p style={{ fontSize: 11, color: 'var(--text-3)' }}>
            📍 {venue.fullName}{venue.address?.city ? ` · ${venue.address.city}${venue.address.state ? `, ${venue.address.state}` : ''}` : ''}
          </p>
        )}
        {(comp as any).broadcasts?.[0]?.names?.[0] && (
          <p style={{ fontSize: 11, color: 'var(--text-3)' }}>
            📺 {(comp as any).broadcasts[0].names[0]}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Win probability bar ──────────────────────────────────────────
function WinProbBar({ summary, teamMap }: { summary: ESPNSummary | null; teamMap: Record<string, TeamInfo> }) {
  const wp = summary?.winprobability
  if (!wp || wp.length === 0) return null
  const latest = wp[wp.length - 1]
  const homePct = Math.round((latest.homeWinPercentage ?? 0.5) * 100)
  const awayPct = 100 - homePct
  const teams = Object.values(teamMap)
  const away = teams[0]
  const home = teams[1]

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', marginBottom: 4 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Win Probability</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {away?.logo && <TeamLogo logo={away.logo} name={away.abbr} size={22} />}
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-2)' }}>{awayPct}%</span>
        </div>
        <div style={{ flex: 1, height: 8, borderRadius: 99, background: 'var(--border)', overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: `${awayPct}%`, background: away?.color ? `#${away.color}` : 'var(--accent)', transition: 'width 0.5s ease' }} />
          <div style={{ flex: 1, background: home?.color ? `#${home.color}` : 'var(--text-3)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-2)' }}>{homePct}%</span>
          {home?.logo && <TeamLogo logo={home.logo} name={home.abbr} size={22} />}
        </div>
      </div>
    </div>
  )
}

// ─── Stat Leaders ─────────────────────────────────────────────────
function Leaders({ summary, teamMap }: { summary: ESPNSummary | null; teamMap: Record<string, TeamInfo> }) {
  const leaders = summary?.leaders
  if (!leaders || leaders.length === 0) return null

  const rows: { headshot?: string; teamLogo?: string; name: string; stat: string; category: string }[] = []
  for (const teamGroup of leaders) {
    const tLogo = teamGroup.team?.logo
    for (const cat of (teamGroup.leaders ?? []).slice(0, 2)) {
      const ldr = cat.leaders?.[0]
      if (!ldr) continue
      rows.push({
        headshot: ldr.athlete?.headshot?.href,
        teamLogo: tLogo,
        name: ldr.athlete?.shortName ?? ldr.athlete?.displayName ?? '',
        stat: ldr.displayValue,
        category: cat.displayName ?? cat.name,
      })
    }
  }
  if (rows.length === 0) return null

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
        Leaders
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <PlayerAvatar headshot={r.headshot} teamLogo={r.teamLogo} name={r.name} size={46} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.category}</p>
            </div>
            <p style={{ fontSize: 18, fontWeight: 900, color: 'var(--accent)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{r.stat}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Play row ─────────────────────────────────────────────────────
function PlayRow({ play, gameId, teamMap, athleteMap, reactions, isLoggedIn, onReact }: {
  play: ESPNPlay
  gameId: string
  teamMap: Record<string, TeamInfo>
  athleteMap: Record<string, { headshot?: string; teamLogo?: string; name: string }>
  reactions: Record<string, { count: number; mine: boolean }>
  isLoggedIn: boolean
  onReact: (playId: string, emoji: string) => void
}) {
  const [showEmojis, setShowEmojis] = useState(false)
  const isScore = play.scoringPlay
  const totalReactions = Object.values(reactions).reduce((s, r) => s + r.count, 0)

  // Primary athlete (batter for MLB, ball-carrier/passer for NFL, etc.)
  const primaryAthlete = play.athletes?.[0]?.athlete
  const secondaryAthlete = play.athletes?.[1]?.athlete
  const primaryStats = play.athletes?.[0]?.statistics ?? []
  const secondaryStats = play.athletes?.[1]?.statistics ?? []

  // Lookup headshot — first from play itself, then from athleteMap built from boxscore
  const primaryHeadshot = primaryAthlete?.headshot?.href
    ?? (primaryAthlete?.displayName ? athleteMap[primaryAthlete.displayName]?.headshot : undefined)
  const secondaryHeadshot = secondaryAthlete?.headshot?.href
    ?? (secondaryAthlete?.displayName ? athleteMap[secondaryAthlete.displayName]?.headshot : undefined)

  // Team logos
  const playTeam = play.team?.id ? teamMap[play.team.id] : undefined
  const allTeams = Object.values(teamMap)
  const opposingTeam = allTeams.find(t => t.id !== play.team?.id)

  const primaryTeamLogo = primaryAthlete?.displayName
    ? (athleteMap[primaryAthlete.displayName]?.teamLogo ?? playTeam?.logo)
    : playTeam?.logo
  const secondaryTeamLogo = secondaryAthlete?.displayName
    ? (athleteMap[secondaryAthlete.displayName]?.teamLogo ?? opposingTeam?.logo)
    : opposingTeam?.logo

  // Format stat line: "2/5, 1 SO" or "1.0 ip, 1 k, 23 p"
  function fmtStats(stats: { name: string; displayValue: string }[]): string {
    return stats
      .filter(s => s.displayValue && s.displayValue !== '0' && s.displayValue !== '--')
      .slice(0, 4)
      .map(s => s.displayValue)
      .join(', ')
  }

  const primaryStatLine = fmtStats(primaryStats)
  const secondaryStatLine = fmtStats(secondaryStats)

  return (
    <div style={{
      padding: '12px 16px',
      borderLeft: `3px solid ${isScore ? 'var(--accent)' : 'transparent'}`,
      background: isScore ? 'rgba(180,255,77,0.025)' : 'transparent',
      borderBottom: '1px solid var(--border)',
    }}>
      {/* Game state header line */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Score bubbles */}
          {allTeams.length >= 2 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {allTeams.map((t, i) => t.logo && (
                <img key={t.id} src={t.logo} alt={t.abbr} style={{ width: 14, height: 14, objectFit: 'contain' }} />
              ))}
            </div>
          )}
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)' }}>
            {play.awayScore}–{play.homeScore}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>·</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{play.period?.displayValue}</span>
          {play.clock?.displayValue && (
            <>
              <span style={{ fontSize: 10, color: 'var(--text-3)' }}>·</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{play.clock.displayValue}</span>
            </>
          )}
        </div>
        {isScore && (
          <span style={{
            fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 99,
            background: 'rgba(180,255,77,0.12)', color: 'var(--accent)',
            border: '1px solid rgba(180,255,77,0.25)',
          }}>🎯 SCORE</span>
        )}
      </div>

      {/* Main play row */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {/* Player headshot with team badge */}
        {primaryAthlete ? (
          <PlayerAvatar
            headshot={primaryHeadshot}
            teamLogo={primaryTeamLogo}
            name={primaryAthlete.displayName}
            size={52}
          />
        ) : playTeam?.logo ? (
          <div style={{ width: 52, height: 52, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={playTeam.logo} alt="" style={{ width: '75%', height: '75%', objectFit: 'contain' }} />
          </div>
        ) : (
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--surface-2)', flexShrink: 0 }} />
        )}

        {/* Text content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Play title */}
          <p style={{
            fontSize: 14, fontWeight: 800, lineHeight: 1.25,
            color: isScore ? 'var(--accent)' : 'var(--text-1)',
            marginBottom: 4,
          }}>
            {play.type?.text || play.text}
          </p>

          {/* Primary athlete stats */}
          {primaryAthlete && (
            <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: secondaryAthlete ? 2 : 0 }}>
              <span style={{ fontWeight: 700 }}>{primaryAthlete.shortName ?? primaryAthlete.displayName}</span>
              {primaryStatLine && <span style={{ color: 'var(--text-3)' }}> · {primaryStatLine}</span>}
            </p>
          )}

          {/* Secondary athlete (pitcher for baseball) */}
          {secondaryAthlete && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {secondaryHeadshot && (
                <img src={secondaryHeadshot} alt="" style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              )}
              <p style={{ fontSize: 11, color: 'var(--text-3)' }}>
                <span style={{ fontWeight: 600 }}>{secondaryAthlete.shortName ?? secondaryAthlete.displayName}</span>
                {secondaryStatLine && <span> · {secondaryStatLine}</span>}
              </p>
            </div>
          )}

          {/* Full play description (if different from type text) */}
          {play.type?.text && play.text && play.type.text !== play.text && (
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4, lineHeight: 1.4 }}>{play.text}</p>
          )}
        </div>

        {/* React button */}
        <button
          onClick={() => setShowEmojis(s => !s)}
          style={{
            flexShrink: 0, alignSelf: 'flex-start',
            background: showEmojis ? 'var(--accent-dim)' : 'var(--surface-2)',
            border: `1px solid ${showEmojis ? 'rgba(180,255,77,0.3)' : 'var(--border)'}`,
            borderRadius: 99, padding: '4px 9px', cursor: 'pointer',
            fontSize: 12, color: showEmojis ? 'var(--accent)' : 'var(--text-3)',
            display: 'flex', alignItems: 'center', gap: 3, marginTop: 2,
          }}
        >
          😄 {totalReactions > 0 ? totalReactions : '+'}
        </button>
      </div>

      {/* Existing reaction counts */}
      {Object.keys(reactions).length > 0 && (
        <div style={{ display: 'flex', gap: 5, marginTop: 8, marginLeft: 64, flexWrap: 'wrap' }}>
          {Object.entries(reactions).map(([emoji, data]) => (
            <button
              key={emoji}
              onClick={() => isLoggedIn && onReact(play.id, emoji)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '2px 8px', borderRadius: 99, cursor: isLoggedIn ? 'pointer' : 'default',
                background: data.mine ? 'rgba(180,255,77,0.12)' : 'var(--surface-2)',
                border: `1px solid ${data.mine ? 'rgba(180,255,77,0.35)' : 'var(--border)'}`,
                fontSize: 13, color: 'var(--text-2)',
              }}
            >
              {emoji} <span style={{ fontSize: 11, fontWeight: 700 }}>{data.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Emoji picker */}
      {showEmojis && (
        <div style={{ display: 'flex', gap: 5, marginTop: 8, marginLeft: 64, flexWrap: 'wrap', alignItems: 'center' }}>
          {EMOJIS.map(e => (
            <button key={e} onClick={() => { if (!isLoggedIn) return; onReact(play.id, e); setShowEmojis(false) }}
              style={{
                fontSize: 20, background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '5px 9px', cursor: isLoggedIn ? 'pointer' : 'not-allowed',
                opacity: isLoggedIn ? 1 : 0.4,
              }}
            >{e}</button>
          ))}
          {!isLoggedIn && (
            <Link href="/auth/login" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', fontWeight: 700 }}>Sign in →</Link>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Play-by-play tab ─────────────────────────────────────────────
function PlayByPlay({ plays, gameId, teamMap, athleteMap, reactions, isLoggedIn, onReact }: {
  plays: ESPNPlay[]
  gameId: string
  teamMap: Record<string, TeamInfo>
  athleteMap: Record<string, { headshot?: string; teamLogo?: string; name: string }>
  reactions: Reactions
  isLoggedIn: boolean
  onReact: (playId: string, emoji: string) => void
}) {
  const [filter, setFilter] = useState<'all' | 'scoring'>('all')
  const displayed = filter === 'scoring' ? plays.filter(p => p.scoringPlay) : plays

  if (plays.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 20px' }}>
        <p style={{ fontSize: 36, marginBottom: 12 }}>🏟️</p>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-2)' }}>No plays yet</p>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>Play-by-play will appear here once the game starts</p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
        {(['all', 'scoring'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700,
            background: filter === f ? 'var(--accent)' : 'var(--surface-2)',
            color: filter === f ? 'var(--accent-fg)' : 'var(--text-2)',
            border: `1px solid ${filter === f ? 'var(--accent)' : 'var(--border)'}`, cursor: 'pointer',
          }}>
            {f === 'all' ? 'All Plays' : '🎯 Scoring Only'}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>{displayed.length} plays</span>
      </div>
      <div>
        {[...displayed].reverse().map(play => (
          <PlayRow
            key={play.id}
            play={play}
            gameId={gameId}
            teamMap={teamMap}
            athleteMap={athleteMap}
            reactions={reactions[play.id] ?? {}}
            isLoggedIn={isLoggedIn}
            onReact={onReact}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Box Score tab ────────────────────────────────────────────────
function BoxScore({ summary, teamMap }: { summary: ESPNSummary | null; teamMap: Record<string, TeamInfo> }) {
  const [teamIdx, setTeamIdx] = useState(0)
  const teams = summary?.boxscore?.teams
  const players = summary?.boxscore?.players

  if (!teams && !players) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 20px' }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-2)' }}>Box score not available</p>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>Stats will appear once the game begins</p>
      </div>
    )
  }

  return (
    <div>
      {/* Team stats side-by-side */}
      {teams && teams.length >= 2 && (
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
          {/* Team headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-2)' }}>{teams[0]?.team?.abbreviation}</span>
              <TeamLogo logo={teams[0]?.team?.logo} name={teams[0]?.team?.abbreviation} size={28} />
            </div>
            <div />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TeamLogo logo={teams[1]?.team?.logo} name={teams[1]?.team?.abbreviation} size={28} />
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-2)' }}>{teams[1]?.team?.abbreviation}</span>
            </div>
          </div>
          {teams[0]?.statistics?.slice(0, 10).map((stat, i) => (
            <div key={stat.name} style={{
              display: 'grid', gridTemplateColumns: '1fr auto 1fr',
              padding: '8px 0', borderTop: '1px solid var(--border)', alignItems: 'center',
            }}>
              <p style={{ textAlign: 'right', fontSize: 14, fontWeight: 800, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{stat.displayValue}</p>
              <p style={{ padding: '0 14px', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{stat.label}</p>
              <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{teams[1]?.statistics?.[i]?.displayValue ?? '—'}</p>
            </div>
          ))}
        </div>
      )}

      {/* Player stats */}
      {players && players.length > 0 && (
        <div style={{ padding: '16px' }}>
          {/* Team selector with logos */}
          {players.length > 1 && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              {players.map((p, i) => {
                const teamLogoUrl = teams?.[i]?.team?.logo
                return (
                  <button key={i} onClick={() => setTeamIdx(i)} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700,
                    background: teamIdx === i ? 'var(--surface-2)' : 'transparent',
                    color: teamIdx === i ? 'var(--text-1)' : 'var(--text-3)',
                    border: `1px solid ${teamIdx === i ? 'var(--border-2)' : 'var(--border)'}`,
                    cursor: 'pointer',
                  }}>
                    <TeamLogo logo={teamLogoUrl} name={p.team.abbreviation} size={22} />
                    {p.team.abbreviation}
                  </button>
                )
              })}
            </div>
          )}

          {players[teamIdx]?.statistics?.map(statGroup => (
            <div key={statGroup.name} style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>{statGroup.name}</p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 320 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '4px 6px', color: 'var(--text-3)', fontWeight: 600, fontSize: 10 }}>PLAYER</th>
                      {statGroup.labels?.map((lbl: string) => (
                        <th key={lbl} style={{ textAlign: 'center', padding: '4px 6px', color: 'var(--text-3)', fontWeight: 600, fontSize: 10, minWidth: 34 }}>{lbl}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {statGroup.athletes?.map((a, ai) => {
                      const teamLogoUrl = teams?.[teamIdx]?.team?.logo
                      return (
                        <tr key={ai} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                              <PlayerAvatar
                                headshot={a.athlete.headshot?.href}
                                teamLogo={teamLogoUrl}
                                name={a.athlete.displayName}
                                size={34}
                              />
                              <div>
                                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{a.athlete.displayName}</p>
                                {a.athlete.position?.abbreviation && (
                                  <p style={{ fontSize: 10, color: 'var(--text-3)' }}>{a.athlete.position.abbreviation}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          {a.stats?.map((v: string, si: number) => (
                            <td key={si} style={{ textAlign: 'center', padding: '8px 6px', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>{v}</td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Community Picks tab ──────────────────────────────────────────
function CommunityPicksTab({ picks, sport, gameId, teamMap }: {
  picks: any[]
  sport: SportKey
  gameId: string
  teamMap: Record<string, TeamInfo>
}) {
  if (picks.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 20px' }}>
        <p style={{ fontSize: 36, marginBottom: 12 }}>🎯</p>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}>No picks yet</p>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20 }}>Be the first to post your take on this game</p>
        <Link href={`/feed?pick=true&game=${gameId}&sport=${sport}`} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px',
          borderRadius: 99, background: 'var(--accent)', color: 'var(--accent-fg)',
          fontSize: 13, fontWeight: 800, textDecoration: 'none',
        }}>
          <TrendingUp size={14} /> Post Your Pick
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>{picks.length} community picks</p>
        <Link href={`/feed?pick=true&game=${gameId}&sport=${sport}`} style={{
          padding: '6px 14px', borderRadius: 99, background: 'var(--accent)', color: 'var(--accent-fg)',
          fontSize: 11, fontWeight: 800, textDecoration: 'none',
        }}>+ Add Pick</Link>
      </div>
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {picks.map(pick => <PostCardClient key={pick.id} post={pick} />)}
      </div>
    </div>
  )
}

// ─── Summary tab ──────────────────────────────────────────────────
function SummaryTab({ plays, gameStatus }: { plays: ESPNPlay[]; gameStatus: { state: string } }) {
  const scoringPlays = plays.filter(p => p.scoringPlay)

  if (plays.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <p style={{ fontSize: 36, marginBottom: 10 }}>🏟️</p>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-2)' }}>
          {gameStatus.state === 'pre' ? "Game hasn't started yet" : 'Loading...'}
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px' }}>
      {/* Last play */}
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Last Play</p>
        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{plays[plays.length - 1]?.text}</p>
      </div>

      {/* Scoring plays */}
      {scoringPlays.length > 0 && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Scoring Summary</p>
          {scoringPlays.map(p => (
            <div key={p.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>🎯</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 600, lineHeight: 1.3 }}>{p.text}</p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
                  {p.period?.displayValue} · {p.clock?.displayValue}
                  <span style={{ marginLeft: 8, fontWeight: 700, color: 'var(--text-2)' }}>{p.awayScore}–{p.homeScore}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────
type Tab = 'summary' | 'plays' | 'boxscore' | 'picks'

export function GameDetailClient({
  sport, gameId, sportLabel,
  game, summary, gameStatus: serverGameStatus, teams,
  communityPicks, initialReactions, isLoggedIn,
}: {
  sport: SportKey
  gameId: string
  sportLabel: string
  game: ESPNGame | null
  summary: ESPNSummary | null
  gameStatus: { state: string; label: string; isLive: boolean }
  teams: { away: any; home: any }
  communityPicks: any[]
  initialReactions: Reactions
  isLoggedIn: boolean
}) {
  const [tab, setTab] = useState<Tab>('summary')
  const [reactions, setReactions] = useState<Reactions>(initialReactions)
  // serverGameStatus.label was formatted server-side (getGameStatus's
  // toLocaleTimeString call runs on Vercel's own server clock/timezone when
  // called there, not the visitor's) — recomputed here instead so a
  // pre-game start time actually reflects whatever timezone this browser
  // is in. state/isLive don't depend on formatting, so those are fine as
  // the server computed them either way.
  const gameStatus = game && serverGameStatus.state === 'pre' ? getGameStatus(game) : serverGameStatus
  const isLive = gameStatus.isLive
  const teamMap = buildTeamMap(summary, game)
  const athleteMap = buildAthleteMap(summary, teamMap)
  const plays = summary?.plays ?? []

  useEffect(() => {
    if (!isLive) return
    const id = setInterval(() => window.location.reload(), 30000)
    return () => clearInterval(id)
  }, [isLive])

  const handleReact = useCallback(async (playId: string, emoji: string) => {
    if (!isLoggedIn) return
    setReactions(prev => {
      const next = { ...prev }
      if (!next[playId]) next[playId] = {}
      const cur = next[playId][emoji]
      if (cur?.mine) {
        next[playId][emoji] = { count: Math.max(0, cur.count - 1), mine: false }
        if (next[playId][emoji].count === 0) delete next[playId][emoji]
      } else {
        for (const e of Object.keys(next[playId])) {
          if (next[playId][e].mine) {
            next[playId][e] = { count: Math.max(0, next[playId][e].count - 1), mine: false }
            if (next[playId][e].count === 0) delete next[playId][e]
          }
        }
        next[playId][emoji] = { count: (cur?.count ?? 0) + 1, mine: true }
      }
      return next
    })
    await fetch('/api/play-reactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_id: gameId, play_id: playId, emoji }),
    })
  }, [gameId, isLoggedIn])

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'plays', label: 'Play-by-Play', count: plays.length || undefined },
    { id: 'boxscore', label: 'Box Score' },
    { id: 'picks', label: `Picks${communityPicks.length > 0 ? ` (${communityPicks.length})` : ''}` },
  ]

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px' }}>
      {/* Back */}
      <Link href="/sports" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-3)', fontSize: 13, textDecoration: 'none', marginBottom: 18 }}>
        <ArrowLeft size={14} /> {sportLabel} Scores
      </Link>

      {/* Scoreboard */}
      <Scoreboard summary={summary} game={game} gameStatus={gameStatus} isLive={isLive} />

      {/* Win prob */}
      {(gameStatus.state === 'in' || gameStatus.state === 'post') && (
        <div style={{ marginTop: 8 }}>
          <WinProbBar summary={summary} teamMap={teamMap} />
        </div>
      )}

      {/* Leaders below scoreboard */}
      {(gameStatus.state === 'in' || gameStatus.state === 'post') && (
        <div style={{ marginTop: 8 }}>
          <Leaders summary={summary} teamMap={teamMap} />
        </div>
      )}

      {/* Post pick CTA */}
      <div style={{ margin: '12px 0', background: 'var(--accent-dim)', border: '1px solid rgba(180,255,77,0.2)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Got a pick on this game?</p>
        <Link href={`/feed?pick=true&game=${gameId}&sport=${sport}`} style={{ padding: '8px 16px', background: 'var(--accent)', color: 'var(--accent-fg)', borderRadius: 8, fontWeight: 800, fontSize: 12, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          Post Pick →
        </Link>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {TABS.map(t => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '11px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: 'none', border: 'none',
                color: active ? 'var(--accent)' : 'var(--text-3)',
                borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                marginBottom: -1, whiteSpace: 'nowrap', transition: 'color 130ms',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Tab panels */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 16px 16px', overflow: 'hidden', minHeight: 200 }}>
        {tab === 'summary' && (
          <div>
            <SummaryTab plays={plays} gameStatus={gameStatus} />
          </div>
        )}
        {tab === 'plays' && (
          <PlayByPlay
            plays={plays}
            gameId={gameId}
            teamMap={teamMap}
            athleteMap={athleteMap}
            reactions={reactions}
            isLoggedIn={isLoggedIn}
            onReact={handleReact}
          />
        )}
        {tab === 'boxscore' && <BoxScore summary={summary} teamMap={teamMap} />}
        {tab === 'picks' && (
          <CommunityPicksTab
            picks={communityPicks}
            sport={sport}
            gameId={gameId}
            teamMap={teamMap}
          />
        )}
      </div>

      {isLive && (
        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-3)', marginTop: 14 }}>
          🔴 Live · refreshes every 30s
        </p>
      )}
    </div>
  )
}
