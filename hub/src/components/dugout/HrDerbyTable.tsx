'use client'

import { useMemo, useState } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

export type DerbyPlayer = {
  name: string
  mlbId: number
  teamAbbr: string
  headshotUrl: string
  teamLogoUrl: string
  avgBatSpeed: number
  squaredUpPct: number
  blastPct: number
  exitVeloAvg: number
  barrelPct: number
  hardHitPct: number
  xhr: number
  hrTotal: number
  avgHrDistance: number
  onTimePct: number
  missDistance: number
  recentEv: number
  recentHardHit: number
  recentBarrel: number
  recentWhiff: number
  recentHrs: number
  phiCareerHr: number
}

type ColDef = { key: keyof DerbyPlayer; label: string; fmt?: (v: number) => string }

// Green (best) -> yellow -> red (worst), relative to just these 8 derby
// participants, not a league-wide scale.
function heatColor(value: number, min: number, max: number): string {
  if (max === min) return 'rgba(180,255,77,0.10)'
  const t = (value - min) / (max - min)
  if (t > 0.66) return `rgba(180,255,77,${0.08 + t * 0.22})`
  if (t > 0.33) return `rgba(250,204,21,${0.06 + t * 0.14})`
  return `rgba(248,113,113,${0.05 + (1 - t) * 0.14})`
}

function SortableSection({ title, subtitle, players, columns }: {
  title: string
  subtitle: string
  players: DerbyPlayer[]
  columns: ColDef[]
}) {
  const [sortKey, setSortKey] = useState<keyof DerbyPlayer>(columns[0].key)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const ranges = useMemo(() => {
    const r: Record<string, { min: number; max: number }> = {}
    for (const col of columns) {
      const vals = players.map(p => Number(p[col.key]) || 0)
      r[col.key as string] = { min: Math.min(...vals), max: Math.max(...vals) }
    }
    return r
  }, [players, columns])

  const sorted = useMemo(() => {
    const copy = [...players]
    copy.sort((a, b) => {
      const av = Number(a[sortKey]) || 0
      const bv = Number(b[sortKey]) || 0
      return sortDir === 'desc' ? bv - av : av - bv
    })
    return copy
  }, [players, sortKey, sortDir])

  function handleSort(key: keyof DerbyPlayer) {
    if (key === sortKey) setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  return (
    <div className="ss-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <p style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)' }}>{title}</p>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Player
              </th>
              {columns.map(col => (
                <th
                  key={col.key as string}
                  onClick={() => handleSort(col.key)}
                  style={{
                    textAlign: 'center', padding: '12px 10px', fontSize: 11, fontWeight: 800,
                    color: sortKey === col.key ? 'var(--accent)' : 'var(--text-3)',
                    textTransform: 'uppercase', letterSpacing: '0.03em', cursor: 'pointer', userSelect: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {col.label}
                    {sortKey === col.key
                      ? (sortDir === 'desc' ? <ArrowDown size={11} /> : <ArrowUp size={11} />)
                      : <ArrowUpDown size={11} style={{ opacity: 0.4 }} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr key={p.mlbId} style={{ borderBottom: i < sorted.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <td style={{ padding: '9px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={{ position: 'relative', width: 36, height: 36 }}>
                      <img src={p.headshotUrl} alt={p.name} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', background: 'var(--surface-2)' }} />
                      <img src={p.teamLogoUrl} alt={p.teamAbbr} style={{ position: 'absolute', bottom: -2, right: -4, width: 15, height: 15, objectFit: 'contain', filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.8))' }} />
                    </div>
                    <div>
                      <p style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{p.name}</p>
                      <p style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{p.teamAbbr}</p>
                    </div>
                  </div>
                </td>
                {columns.map(col => {
                  const raw = Number(p[col.key]) || 0
                  const { min, max } = ranges[col.key as string]
                  return (
                    <td
                      key={col.key as string}
                      style={{
                        textAlign: 'center', padding: '9px 10px', fontSize: 13.5, fontWeight: 800,
                        color: 'var(--text-1)', background: heatColor(raw, min, max),
                      }}
                    >
                      {col.fmt ? col.fmt(raw) : raw}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function HrDerbyTable({ players }: { players: DerbyPlayer[] }) {
  const pct1 = (v: number) => `${v.toFixed(1)}%`
  const dec1 = (v: number) => v.toFixed(1)
  const dec3 = (v: number) => v.toFixed(3)

  return (
    <div>
      <SortableSection
        title="⚡ Bat Tracking & Power"
        subtitle="Season Statcast — pure bat/contact quality, no pitcher involved"
        players={players}
        columns={[
          { key: 'avgBatSpeed', label: 'Bat Speed (mph)', fmt: dec1 },
          { key: 'squaredUpPct', label: 'Squared-Up%', fmt: pct1 },
          { key: 'blastPct', label: 'Blast%', fmt: pct1 },
          { key: 'exitVeloAvg', label: 'Avg Exit Velo', fmt: dec1 },
          { key: 'barrelPct', label: 'Barrel%', fmt: pct1 },
          { key: 'hardHitPct', label: 'Hard-Hit%', fmt: pct1 },
        ]}
      />
      <SortableSection
        title="💣 Home Run Production"
        subtitle="Expected vs. actual HRs, and how far they've gone this season"
        players={players}
        columns={[
          { key: 'hrTotal', label: 'HR Total' },
          { key: 'xhr', label: 'xHR', fmt: dec1 },
          { key: 'avgHrDistance', label: 'Avg HR Dist (ft)', fmt: dec1 },
          { key: 'phiCareerHr', label: 'HRs at Citizens Bank Park' },
        ]}
      />
      <SortableSection
        title="🔥 Recent Form — Last 14 Days"
        subtitle="Pitch-count-weighted across every pitch type they've actually faced recently"
        players={players}
        columns={[
          { key: 'recentEv', label: 'Exit Velo', fmt: dec1 },
          { key: 'recentHardHit', label: 'Hard-Hit%', fmt: pct1 },
          { key: 'recentBarrel', label: 'Barrel%', fmt: pct1 },
          { key: 'recentWhiff', label: 'Whiff%', fmt: pct1 },
          { key: 'recentHrs', label: 'Recent HRs' },
        ]}
      />
      <SortableSection
        title="⏱️ Timing"
        subtitle="How on-time their swing has been, and average miss distance from the sweet spot"
        players={players}
        columns={[
          { key: 'onTimePct', label: 'On-Time%', fmt: pct1 },
          { key: 'missDistance', label: 'Miss Distance (in)', fmt: dec1 },
        ]}
      />
    </div>
  )
}
