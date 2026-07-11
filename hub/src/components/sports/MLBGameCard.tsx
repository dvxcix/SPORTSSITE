'use client'

import Link from 'next/link'
import { useState } from 'react'
import { mlbGameLabel, mlbGameIsLive, mlbTeamLogo } from '@/lib/mlb-api'
import type { MLBGame } from '@/lib/mlb-api'

function TeamLogo({ id, name, size = 28 }: { id: number; name: string; size?: number }) {
  const [err, setErr] = useState(false)
  if (err || !id) return (
    <div style={{ width: size, height: size, borderRadius: 4, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.35, fontWeight: 800, color: 'var(--text-3)', flexShrink: 0 }}>
      {name?.[0] ?? '?'}
    </div>
  )
  return <img src={mlbTeamLogo(id)} alt={name} onError={() => setErr(true)} style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }} />
}

export function MLBGameCard({ game }: { game: MLBGame }) {
  const [hovered, setHovered] = useState(false)
  const isLive = mlbGameIsLive(game)
  const isFinal = game.status.abstractGameState === 'Final'
  const label = mlbGameLabel(game)
  const away = game.teams.away
  const home = game.teams.home
  const ls = game.linescore

  return (
    <Link href={`/sports/mlb/${game.gamePk}`} style={{ textDecoration: 'none' }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: hovered ? 'var(--surface-2)' : 'var(--surface)',
          border: `1px solid ${isLive ? 'rgba(255,77,106,0.4)' : hovered ? 'var(--border-2)' : 'var(--border)'}`,
          borderRadius: 14, padding: '14px 16px',
          transition: 'border-color 140ms, background 140ms',
          cursor: 'pointer', height: '100%',
        }}
      >
        {/* Status row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: isLive ? 'var(--red)' : 'var(--text-3)', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 4 }}>
            {isLive && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--red)', display: 'inline-block', animation: 'pulse 1.4s ease-in-out infinite' }} />}
            {label.toUpperCase()}
          </span>
          {isLive && ls && (
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
              {ls.balls ?? 0}-{ls.strikes ?? 0} · {ls.outs ?? 0} out{ls.outs !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Teams */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { t: away, side: 'away' as const },
            { t: home, side: 'home' as const },
          ].map(({ t }) => (
            <div key={t.team.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <TeamLogo id={t.team.id} name={t.team.name} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.team.teamName || t.team.name}
                </p>
                <p style={{ fontSize: 10, color: 'var(--text-3)' }}>{t.leagueRecord.wins}-{t.leagueRecord.losses}</p>
              </div>
              {(isLive || isFinal) && (
                <span style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums', minWidth: 28, textAlign: 'right' }}>
                  {t.score ?? 0}
                </span>
              )}
            </div>
          ))}
        </div>

        {game.venue?.name && (
          <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 8 }}>
            {game.venue.name}
          </p>
        )}
      </div>
    </Link>
  )
}

export function MLBGameCardCompact({ game }: { game: MLBGame }) {
  const [hovered, setHovered] = useState(false)
  const isLive = mlbGameIsLive(game)
  const isFinal = game.status.abstractGameState === 'Final'
  const label = mlbGameLabel(game)
  const away = game.teams.away
  const home = game.teams.home

  return (
    <Link href={`/sports/mlb/${game.gamePk}`} style={{ textDecoration: 'none', flexShrink: 0 }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: hovered ? 'var(--surface-2)' : 'var(--surface)',
          border: `1px solid ${isLive ? 'rgba(255,77,106,0.3)' : hovered ? 'var(--border-2)' : 'var(--border)'}`,
          borderRadius: 12, padding: '10px 14px', minWidth: 160,
          cursor: 'pointer', transition: 'border-color 140ms, background 140ms',
        }}
      >
        <p style={{ fontSize: 9, fontWeight: 700, color: isLive ? 'var(--red)' : 'var(--text-3)', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</p>
        {[away, home].map((t, i) => (
          <div key={t.team.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: i === 0 ? 4 : 0 }}>
            <TeamLogo id={t.team.id} name={t.team.name} size={18} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.team.abbreviation ?? t.team.teamName}
            </span>
            {(isLive || isFinal) && (
              <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-1)' }}>{t.score ?? 0}</span>
            )}
          </div>
        ))}
      </div>
    </Link>
  )
}
