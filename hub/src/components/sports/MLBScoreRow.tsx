'use client'

import Link from 'next/link'
import { useState } from 'react'
import { mlbTeamLogo, mlbGameLabel, mlbGameIsLive, mlbGameIsFinal } from '@/lib/mlb-api'
import type { MLBGame } from '@/lib/mlb-api'

function Logo({ id, name, size = 32 }: { id: number; name: string; size?: number }) {
  const [err, setErr] = useState(false)
  // clamp() instead of a fixed px size so the logo shrinks on narrow phone
  // viewports (where this row's fixed-width status/venue columns leave much
  // less room for the flexible away/home sections) without any JS/media query.
  const dim = `clamp(${size - 8}px, 7vw, ${size}px)`
  if (err || !id) return (
    <div style={{ width: dim, height: dim, borderRadius: 4, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 900, color: 'var(--text-3)', flexShrink: 0 }}>
      {name?.[0] ?? '?'}
    </div>
  )
  return (
    <img
      src={mlbTeamLogo(id)}
      alt={name}
      onError={() => setErr(true)}
      style={{ width: dim, height: dim, objectFit: 'contain', flexShrink: 0 }}
    />
  )
}

export function MLBScoreRow({ game }: { game: MLBGame }) {
  const [hovered, setHovered] = useState(false)
  const isLive = mlbGameIsLive(game)
  const isFinal = mlbGameIsFinal(game)
  const isPre = !isLive && !isFinal
  const label = mlbGameLabel(game)
  const away = game.teams.away
  const home = game.teams.home
  const ls = game.linescore
  const awayWin = isFinal && (away.score ?? 0) > (home.score ?? 0)
  const homeWin = isFinal && (home.score ?? 0) > (away.score ?? 0)

  return (
    <Link href={`/sports/mlb/${game.gamePk}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center',
          padding: '10px 16px',
          background: hovered ? 'var(--surface-2)' : 'transparent',
          borderBottom: '1px solid var(--border)',
          cursor: 'pointer',
          transition: 'background 120ms',
          gap: 0,
        }}
      >
        {/* Live pulse */}
        <div style={{ width: 14, flexShrink: 0 }}>
          {isLive && (
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }} />
          )}
        </div>

        {/* Away team */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Logo id={away.team.id} name={away.team.name} size={28} />
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: awayWin ? 900 : 700, color: awayWin ? 'var(--text-1)' : isPre ? 'var(--text-2)' : 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {away.team.teamName || away.team.name}
            </p>
            <p style={{ fontSize: 10, color: 'var(--text-3)' }}>{away.leagueRecord.wins}-{away.leagueRecord.losses}</p>
          </div>
          {!isPre && (
            <span style={{ fontSize: 22, fontWeight: 900, color: awayWin ? 'var(--text-1)' : 'var(--text-3)', fontVariantNumeric: 'tabular-nums', marginLeft: 'auto', paddingRight: 8, minWidth: 28, textAlign: 'right' }}>
              {away.score ?? 0}
            </span>
          )}
        </div>

        {/* Status center */}
        <div className="w-[64px] sm:w-[100px]" style={{ flexShrink: 0, textAlign: 'center', padding: '0 8px' }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: isLive ? 'var(--red)' : isFinal ? 'var(--text-3)' : 'var(--text-2)', letterSpacing: '0.02em' }}>
            {isFinal ? 'Final' : isLive ? label : label}
          </p>
          {isLive && ls?.balls !== undefined && (
            <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
              {ls.balls}-{ls.strikes} · {ls.outs} out{ls.outs !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Home team */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end', minWidth: 0 }}>
          {!isPre && (
            <span style={{ fontSize: 22, fontWeight: 900, color: homeWin ? 'var(--text-1)' : 'var(--text-3)', fontVariantNumeric: 'tabular-nums', paddingLeft: 8, minWidth: 28, textAlign: 'left' }}>
              {home.score ?? 0}
            </span>
          )}
          <div style={{ textAlign: 'right', minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: homeWin ? 900 : 700, color: homeWin ? 'var(--text-1)' : isPre ? 'var(--text-2)' : 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {home.team.teamName || home.team.name}
            </p>
            <p style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'right' }}>{home.leagueRecord.wins}-{home.leagueRecord.losses}</p>
          </div>
          <Logo id={home.team.id} name={home.team.name} size={28} />
        </div>

        {/* Venue / time — hidden on narrow phones, no room next to the
            already-tight away/status/home columns and it's non-essential
            (the game detail page has full venue info). */}
        <div className="hidden sm:block" style={{ width: 90, flexShrink: 0, textAlign: 'right', paddingLeft: 12 }}>
          {isPre && game.venue?.name && (
            <p style={{ fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{game.venue.name}</p>
          )}
        </div>
      </div>
    </Link>
  )
}
