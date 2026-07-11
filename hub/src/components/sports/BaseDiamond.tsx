'use client'
import { useState } from 'react'
import { mlbHeadshot } from '@/lib/mlb-api'

type Runner = { id: number; fullName: string } | null | undefined

interface Props {
  first?: boolean
  second?: boolean
  third?: boolean
  runnerFirst?: Runner
  runnerSecond?: Runner
  runnerThird?: Runner
  /** Team abbreviation of the team currently batting (all runners belong to it) */
  offenseTeamAbbr?: string | null
  size?: number
}

// Just the transparent headshot, sized to sit directly on the base marker —
// no circle, no team-color backdrop, no clip. It's a small accent on the
// base, not a standalone avatar.
function RunnerAvatar({ runner, x, y, s }: { runner: Runner; x: number; y: number; s: number }) {
  const [err, setErr] = useState(false)
  if (!runner || err) return null
  const d = s * 0.5
  return (
    <image
      href={mlbHeadshot(runner.id)}
      x={x - d / 2} y={y - d / 2} width={d} height={d}
      preserveAspectRatio="xMidYMid meet"
      onError={() => setErr(true)}
    />
  )
}

export function BaseDiamond({
  first = false, second = false, third = false,
  runnerFirst, runnerSecond, runnerThird,
  offenseTeamAbbr,
  size = 40,
}: Props) {
  const s = size
  const cx = s / 2
  const cy = s / 2
  const r = s * 0.18  // base square half-width

  // Positions: home at bottom, first at right, second at top, third at left
  const bases = [
    { x: cx + s * 0.27, y: cy,          occupied: first,  runner: runnerFirst,  key: '1b' },
    { x: cx,            y: cy - s * 0.27, occupied: second, runner: runnerSecond, key: '2b' },
    { x: cx - s * 0.27, y: cy,          occupied: third,  runner: runnerThird,  key: '3b' },
  ]

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ display: 'block', flexShrink: 0, overflow: 'visible' }}>
      {/* Diamond outline paths */}
      <polyline
        points={`${cx},${cy + s * 0.27} ${cx + s * 0.27},${cy} ${cx},${cy - s * 0.27} ${cx - s * 0.27},${cy} ${cx},${cy + s * 0.27}`}
        fill="none"
        stroke="var(--border-2)"
        strokeWidth={1}
      />
      {/* Home plate marker */}
      <rect
        x={cx - r * 0.6} y={cy + s * 0.27 - r * 0.6}
        width={r * 1.2} height={r * 1.2}
        rx={1}
        fill="var(--border-2)"
        transform={`rotate(45 ${cx} ${cy + s * 0.27})`}
      />
      {/* Bases */}
      {bases.map(b => (
        <rect
          key={b.key}
          x={b.x - r} y={b.y - r}
          width={r * 2} height={r * 2}
          rx={1.5}
          fill={b.occupied ? 'var(--accent)' : 'var(--surface-2)'}
          stroke={b.occupied ? 'rgba(180,255,77,0.4)' : 'var(--border)'}
          strokeWidth={b.occupied ? 1.5 : 1}
          transform={`rotate(45 ${b.x} ${b.y})`}
          style={{ transition: 'fill 200ms, stroke 200ms' }}
        />
      ))}
      {/* Runner headshots, centered directly on their occupied base */}
      {bases.map(b => b.occupied && b.runner && (
        <RunnerAvatar key={`av-${b.key}`} runner={b.runner} x={b.x} y={b.y} s={s} />
      ))}
    </svg>
  )
}
