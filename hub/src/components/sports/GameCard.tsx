'use client'

import Link from 'next/link'
import { useState } from 'react'
import { getGameStatus, getTeams } from '@/lib/espn-api'
import type { ESPNGame, SportKey } from '@/lib/espn-api'

export function GameCard({ game, sport }: { game: ESPNGame; sport: SportKey }) {
  const [hovered, setHovered] = useState(false)
  const { away, home } = getTeams(game)
  const { label, isLive, state } = getGameStatus(game)
  const comp = game.competitions?.[0]

  return (
    <Link href={`/sports/${sport}/${game.id}`} style={{ textDecoration: 'none' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: isLive ? 'var(--red)' : 'var(--text-3)', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 4 }}>
            {isLive && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }} />}
            {label}
          </span>
          {comp?.broadcasts?.[0]?.names?.[0] && (
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{comp.broadcasts[0].names[0]}</span>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[away, home].map((team, i) => team && (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {team.team.logo && (
                <img src={team.team.logo} alt="" style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {team.team.shortDisplayName || team.team.name}
                </p>
                {team.records?.[0] && (
                  <p style={{ fontSize: 10, color: 'var(--text-3)' }}>{team.records[0].summary}</p>
                )}
              </div>
              {state !== 'pre' && (
                <span style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums', minWidth: 30, textAlign: 'right' }}>
                  {team.score ?? '0'}
                </span>
              )}
            </div>
          ))}
        </div>

        {comp?.odds?.[0] && (
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-3)', display: 'flex', gap: 12 }}>
            <span>Spread: <strong style={{ color: 'var(--text-2)' }}>{comp.odds[0].details}</strong></span>
            <span>O/U: <strong style={{ color: 'var(--text-2)' }}>{comp.odds[0].overUnder}</strong></span>
          </div>
        )}

        {comp?.venue && (
          <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>
            📍 {comp.venue.fullName}
          </p>
        )}
      </div>
    </Link>
  )
}

export function GameCardCompact({ game, sport }: { game: ESPNGame; sport: SportKey }) {
  const [hovered, setHovered] = useState(false)
  const { away, home } = getTeams(game)
  const { label, state } = getGameStatus(game)

  return (
    <Link href={`/sports/${sport}/${game.id}`} style={{ textDecoration: 'none', flexShrink: 0 }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: hovered ? 'var(--surface-2)' : 'var(--surface)',
          border: `1px solid ${hovered ? 'var(--border-2)' : 'var(--border)'}`,
          borderRadius: 12, padding: '10px 14px', minWidth: 160,
          cursor: 'pointer', transition: 'border-color 140ms, background 140ms',
        }}
      >
        <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</p>
        {[away, home].map((t, i) => t && (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: i === 0 ? 4 : 0 }}>
            {t.team.logo && <img src={t.team.logo} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} />}
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.team.abbreviation}
            </span>
            {state !== 'pre' && (
              <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-1)' }}>{t.score ?? 0}</span>
            )}
          </div>
        ))}
      </div>
    </Link>
  )
}
