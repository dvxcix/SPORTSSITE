'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'

type StatcastLine = {
  barrelPct: number | null; hardHitPct: number | null; sweetSpotPct: number | null
  avgEv: number | null; avgLa: number | null; hardSwingRate: number | null; squaredUpPct: number | null
}

type RecapRow = {
  id: string
  mlb_id: number
  player_name: string | null
  team: string | null
  pitcher_id: number | null
  pitcher_name: string | null
  pitcher_hand: string | null
  is_fhr: boolean
  inning: number | null
  half_inning: string | null
  pitch_type: string | null
  exit_velocity: number | null
  launch_angle: number | null
  hit_distance: number | null
  row_data: {
    game?: { homeTeam?: string | null; awayTeam?: string | null }
    statcastWindows?: Record<string, StatcastLine> | null
  }
}

type SortKey = 'dist' | 'ev' | 'la' | 'order'
const SORT_LABELS: Record<SortKey, string> = { order: 'Chronological', dist: 'Distance', ev: 'Exit Velo', la: 'Launch Angle' }

function fmt(n: number | null | undefined, digits = 0, suffix = '') {
  return n == null ? '—' : `${n.toFixed(digits)}${suffix}`
}

function todayEt() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}
function addDays(date: string, delta: number) {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

export function DailyRecapClient() {
  const [date, setDate] = useState(todayEt)
  const [rows, setRows] = useState<RecapRow[] | null>(null)
  const [error, setError] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('dist')

  useEffect(() => {
    let cancelled = false
    setRows(null)
    setError('')
    fetch(`/api/daily-recap?date=${date}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setRows(d.hrs ?? []) })
      .catch(() => { if (!cancelled) setError('Failed to load this date.') })
    return () => { cancelled = true }
  }, [date])

  const sorted = useMemo(() => {
    if (!rows) return []
    const arr = [...rows]
    if (sortKey === 'dist') arr.sort((a, b) => (b.hit_distance ?? -1) - (a.hit_distance ?? -1))
    else if (sortKey === 'ev') arr.sort((a, b) => (b.exit_velocity ?? -1) - (a.exit_velocity ?? -1))
    else if (sortKey === 'la') arr.sort((a, b) => (b.launch_angle ?? -999) - (a.launch_angle ?? -999))
    // 'order' keeps the natural at_bat_index order the API already returned
    return arr
  }, [rows, sortKey])

  const isToday = date === todayEt()

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setDate(d => addDays(d, -1))} style={navBtnStyle}>←</button>
          <input
            type="date" value={date} max={todayEt()}
            onChange={e => e.target.value && setDate(e.target.value)}
            style={{ ...navBtnStyle, fontWeight: 700, cursor: 'pointer' }}
          />
          <button onClick={() => setDate(d => addDays(d, 1))} disabled={isToday} style={{ ...navBtnStyle, opacity: isToday ? 0.4 : 1 }}>→</button>
          {!isToday && <button onClick={() => setDate(todayEt())} style={navBtnStyle}>Today</button>}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
            <button key={k} onClick={() => setSortKey(k)} style={{
              ...navBtnStyle,
              background: sortKey === k ? 'var(--accent)' : 'var(--surface)',
              color: sortKey === k ? 'var(--accent-fg, #0B1600)' : 'var(--text-2)',
            }}>
              {SORT_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}
      {!error && rows === null && <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Loading…</div>}
      {!error && rows !== null && rows.length === 0 && (
        <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
          No home runs {isToday ? 'yet today' : 'that day'}.
        </div>
      )}

      {!error && rows !== null && rows.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>{rows.length} home run{rows.length === 1 ? '' : 's'}</div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {sorted.map(row => <HrCard key={row.id} row={row} />)}
      </div>
    </div>
  )
}

const navBtnStyle: React.CSSProperties = {
  padding: '7px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)',
  color: 'var(--text-2)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 52 }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>{value}</span>
      <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</span>
    </div>
  )
}

function HrCard({ row }: { row: RecapRow }) {
  const l5 = row.row_data?.statcastWindows?.l5 ?? null
  const teamLogo = getTeamLogoUrl(row.team || undefined)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, flexWrap: 'wrap',
    }}>
      <div style={{ position: 'relative', width: 46, height: 46, flexShrink: 0 }}>
        <Image src={mlbHeadshot(row.mlb_id)} alt={row.player_name ?? ''} width={46} height={46} style={{ borderRadius: '50%', objectFit: 'cover', border: '1.5px solid var(--border)' }} unoptimized />
        {teamLogo && (
          <img src={teamLogo} alt={row.team ?? ''} width={18} height={18}
            style={{ position: 'absolute', bottom: -2, right: -2, borderRadius: '50%', background: 'var(--bg)', border: '2px solid var(--bg)' }} />
        )}
      </div>

      <div style={{ minWidth: 150 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)' }}>{row.player_name}</span>
          {row.is_fhr && <span title="First HR of the game" style={{ fontSize: 11, fontWeight: 800, color: '#fbbf24' }}>🎯 FHR</span>}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600 }}>
          {row.team} · vs {row.pitcher_name} ({row.pitcher_hand}HP) · {row.half_inning === 'Top' ? '▲' : '▼'} {row.inning}{row.pitch_type ? ` · ${row.pitch_type}` : ''}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 18, marginLeft: 'auto' }}>
        <StatBlock label="Dist" value={fmt(row.hit_distance, 0, ' ft')} />
        <StatBlock label="EV" value={fmt(row.exit_velocity, 1, ' mph')} />
        <StatBlock label="LA" value={fmt(row.launch_angle, 0, '°')} />
      </div>

      {l5 && (
        <div style={{ display: 'flex', gap: 18, paddingLeft: 18, borderLeft: '1px solid var(--border)' }}>
          <StatBlock label="L5 Barrel%" value={fmt(l5.barrelPct, 1, '%')} />
          <StatBlock label="L5 HardHit%" value={fmt(l5.hardHitPct, 1, '%')} />
          <StatBlock label="L5 Avg EV" value={fmt(l5.avgEv, 1)} />
        </div>
      )}
    </div>
  )
}
