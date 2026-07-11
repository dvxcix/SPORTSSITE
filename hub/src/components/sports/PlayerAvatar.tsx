'use client'

import { useState } from 'react'
import { getTeamColor } from '@/lib/mlbTeamColors'

interface PlayerAvatarProps {
  /** Player headshot URL */
  headshot?: string | null
  /** Team logo URL */
  teamLogo?: string | null
  /** Team abbreviation — drives the background color behind the (usually
   *  transparent-background) headshot so players read as their team at a glance. */
  teamAbbr?: string | null
  /** Player/team name for initials fallback */
  name?: string
  /** Avatar diameter in px */
  size?: number
  /** Show the team logo badge (default true) */
  showTeam?: boolean
  /** Optional inline style overrides */
  style?: React.CSSProperties
}

/**
 * Circular player headshot on a team-color backdrop, with a smaller team
 * logo badge in the bottom-right corner. Falls back to initials if no
 * headshot is provided.
 */
export function PlayerAvatar({
  headshot,
  teamLogo,
  teamAbbr,
  name = '',
  size = 44,
  showTeam = true,
  style,
}: PlayerAvatarProps) {
  const [headshotFailed, setHeadshotFailed] = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)

  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()

  // Dugout renders this at much smaller sizes (22-36px) than most other
  // call sites, and at 0.36x the badge shrank into an unreadable dot there
  // even though it looked fine at Live Scores' larger size. Bumping the
  // ratio scales up every consumer, not just Dugout's — but a proportionally
  // bigger badge reads better everywhere, not worse anywhere.
  const badgeSize = Math.round(size * 0.46)
  const showHeadshot = headshot && !headshotFailed
  const showBadge = showTeam && teamLogo && !logoFailed

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
        ...style,
      }}
    >
      {/* Main avatar — team-color backdrop behind the (usually transparent-bg)
          headshot, with the image slightly inset and "contain"-fit so the
          whole face/head shows instead of a tight, cropped-off zoom. */}
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          overflow: 'hidden',
          background: showHeadshot ? getTeamColor(teamAbbr) : 'var(--accent-dim)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.32,
          fontWeight: 800,
          color: 'var(--accent)',
          border: '1.5px solid var(--border)',
        }}
      >
        {showHeadshot ? (
          <img
            src={headshot!}
            alt={name}
            onError={() => setHeadshotFailed(true)}
            style={{ width: '112%', height: '112%', objectFit: 'contain', objectPosition: 'center 40%' }}
          />
        ) : (
          initials || '?'
        )}
      </div>

      {/* Team logo badge */}
      {showBadge && (
        <div
          style={{
            position: 'absolute',
            bottom: -1,
            right: -1,
            width: badgeSize,
            height: badgeSize,
            borderRadius: '50%',
            background: 'var(--bg)',
            border: '2px solid var(--bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <img
            src={teamLogo!}
            alt=""
            onError={() => setLogoFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 1 }}
          />
        </div>
      )}
    </div>
  )
}

/** Just a team logo circle — for matchup headers, pick cards, etc. */
export function TeamLogo({
  logo,
  name = '',
  size = 36,
  style,
}: {
  logo?: string | null
  name?: string
  size?: number
  style?: React.CSSProperties
}) {
  const [failed, setFailed] = useState(false)
  const abbr = name.slice(0, 3).toUpperCase()

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: logo && !failed ? 'transparent' : 'var(--surface-2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
        ...style,
      }}
    >
      {logo && !failed ? (
        <img
          src={logo}
          alt={name}
          onError={() => setFailed(true)}
          style={{ width: '85%', height: '85%', objectFit: 'contain' }}
        />
      ) : (
        <span style={{ fontSize: size * 0.3, fontWeight: 800, color: 'var(--text-3)' }}>{abbr}</span>
      )}
    </div>
  )
}
