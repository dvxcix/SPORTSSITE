'use client'

import { useState } from 'react'
import { SafeImage } from '@/components/ui/SafeImage'
import { sportTeamBackground, sportTeamLogoUrl } from '@/lib/sportTeamArtwork'
import { nbaPortraitFallback } from '@/lib/nbaPlayerPortraits'

interface PlayerAvatarProps {
  /** Player headshot URL */
  headshot?: string | null
  /** Team logo URL */
  teamLogo?: string | null
  /** Team abbreviation — drives the background color behind the (usually
   *  transparent-background) headshot so players read as their team at a glance. */
  teamAbbr?: string | null
  /** Explicit league identity prevents shared abbreviations from using MLB colors. */
  sport?: string
  /** League-specific provider ID; never inferred from a player's name. */
  playerId?: number | string | null
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
  sport,
  playerId,
  name = '',
  size = 44,
  showTeam = true,
  style,
}: PlayerAvatarProps) {
  const [failedHeadshots, setFailedHeadshots] = useState<string[]>([])
  const [failedLogo, setFailedLogo] = useState<string | null>(null)
  // Legacy league-specific MLB callers omit sport. Shared callers pass it.
  const league = sport?.trim().toLowerCase() ?? 'mlb'
  const resolvedLogo = sportTeamLogoUrl(league, teamAbbr) ?? teamLogo
  const sources = [...new Set([headshot, league === 'nba' ? nbaPortraitFallback(playerId) : null].filter((src): src is string => !!src))]
  const resolvedHeadshot = sources.find(src => !failedHeadshots.includes(src))

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
  const showHeadshot = !!resolvedHeadshot
  const showBadge = showTeam && resolvedLogo && failedLogo !== resolvedLogo
  const isNba = league === 'nba'

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
        filter: 'drop-shadow(0 8px 16px rgba(0,0,0,.24))',
        ...style,
      }}
    >
      {/* NBA artwork has a wide transparent canvas. Fill the frame and crop
          the lower jersey so the face stays readable at small sizes. */}
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          overflow: 'hidden',
          background: isNba || league === 'nfl' || showHeadshot ? sportTeamBackground(league, teamAbbr) : 'var(--accent-dim)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.32,
          fontWeight: 800,
          color: 'var(--accent)',
          border: '1px solid color-mix(in srgb, white 17%, var(--border))',
          boxShadow: 'inset 0 1px rgba(255,255,255,.12), 0 0 0 2px rgba(255,255,255,.025)',
        }}
      >
        {showHeadshot ? (
          <SafeImage
            src={resolvedHeadshot!}
            alt={name}
            onError={() => setFailedHeadshots(previous => [...new Set([...previous, resolvedHeadshot!])])}
            style={{
              width: isNba ? '100%' : '112%',
              height: isNba ? '100%' : '112%',
              objectFit: isNba ? 'cover' : 'contain',
              objectPosition: isNba ? 'center' : 'center 40%',
              transform: isNba ? 'scale(1.2)' : undefined,
              transformOrigin: isNba ? 'center 12%' : undefined,
              filter: 'saturate(1.06) contrast(1.02)',
            }}
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
            background: 'color-mix(in srgb, var(--surface-2) 92%, black)',
            border: '2px solid color-mix(in srgb, var(--bg) 88%, transparent)',
            boxShadow: '0 3px 9px rgba(0,0,0,.32)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <SafeImage
            src={resolvedLogo!}
            alt=""
            onError={() => setFailedLogo(resolvedLogo!)}
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
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const failed = !!logo && failedSource === logo
  const abbr = name.slice(0, 3).toUpperCase()

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: logo && !failed ? 'rgba(255,255,255,.025)' : 'var(--surface-2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
        border: '1px solid rgba(255,255,255,.065)',
        boxShadow: 'inset 0 1px rgba(255,255,255,.04), 0 7px 18px rgba(0,0,0,.18)',
        ...style,
      }}
    >
      {logo && !failed ? (
        <SafeImage
          src={logo}
          alt={name}
          onError={() => setFailedSource(logo!)}
          style={{ width: '85%', height: '85%', objectFit: 'contain' }}
        />
      ) : (
        <span style={{ fontSize: size * 0.3, fontWeight: 800, color: 'var(--text-3)' }}>{abbr}</span>
      )}
    </div>
  )
}
