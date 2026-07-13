'use client'

import { useMemo, useState } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

export type DerbyPlayer = {
  name: string
  mlbId: number
  teamAbbr: string
  headshotUrl: string
  teamLogoUrl: string
  seasonHr: number
  careerHr: number
  avg: string
  obp: string
  slg: string
  ops: string
  games: number
  phiCareerHr: number
  phiSeasonHr: number
}

type ColKey = 'seasonHr' | 'careerHr' | 'ops' | 'slg' | 'avg' | 'phiCareerHr'

const COLUMNS: { key: ColKey; label: string; short: string }[] = [
  { key: 'seasonHr', label: `${new Date().getFullYear()} HR`, short: 'Season HR' },
  { key: 'careerHr', label: 'Career HR', short: 'Career HR' },
  { key: 'ops', label: 'OPS', short: 'OPS' },
  { key: 'slg', label: 'SLG', short: 'SLG' },
  { key: 'avg', label: 'AVG', short: 'AVG' },
  { key: 'phiCareerHr', label: 'HRs at Citizens Bank Park', short: 'CBP HRs' },
]

function toNum(v: number | string): number {
  return typeof v === 'number' ? v : parseFloat(v.replace(/^\./, '0.')) || 0
}

// Green (best) -> yellow -> red (worst), relative to this group of 8 only —
// a heatmap of these specific derby participants, not a league-wide scale.
function heatColor(value: number, min: number, max: number): string {
  if (max === min) return 'rgba(180,255,77,0.10)'
  const t = (value - min) / (max - min)
  if (t > 0.66) return `rgba(180,255,77,${0.08 + t * 0.22})`
  if (t > 0.33) return `rgba(250,204,21,${0.06 + t * 0.14})`
  return `rgba(248,113,113,${0.05 + (1 - t) * 0.14})`
}

export function HrDerbyTable({ players }: { players: DerbyPlayer[] }) {
  const [sortKey, setSortKey] = useState<ColKey>('seasonHr')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const ranges = useMemo(() => {
    const r: Record<ColKey, { min: number; max: number }> = {} as any
    for (const col of COLUMNS) {
      const vals = players.map(p => toNum(p[col.key]))
      r[col.key] = { min: Math.min(...vals), max: Math.max(...vals) }
    }
    return r
  }, [players])

  const sorted = useMemo(() => {
    const copy = [...players]
    copy.sort((a, b) => {
      const av = toNum(a[sortKey])
      const bv = toNum(b[sortKey])
      return sortDir === 'desc' ? bv - av : av - bv
    })
    return copy
  }, [players, sortKey, sortDir])

  function handleSort(key: ColKey) {
    if (key === sortKey) {
      setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  return (
    <div className="ss-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Player
              </th>
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  style={{
                    textAlign: 'center', padding: '14px 12px', fontSize: 11, fontWeight: 800,
                    color: sortKey === col.key ? 'var(--accent)' : 'var(--text-3)',
                    textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', userSelect: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {col.short}
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
                <td style={{ padding: '10px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ position: 'relative', width: 42, height: 42, shrink: 0 } as any}>
                      <img src={p.headshotUrl} alt={p.name} style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', background: 'var(--surface-2)' }} />
                      <img src={p.teamLogoUrl} alt={p.teamAbbr} style={{ position: 'absolute', bottom: -2, right: -4, width: 18, height: 18, objectFit: 'contain', filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.8))' }} />
                    </div>
                    <div>
                      <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{p.name}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.teamAbbr} · {p.games} G</p>
                    </div>
                  </div>
                </td>
                {COLUMNS.map(col => {
                  const raw = p[col.key]
                  const num = toNum(raw)
                  const { min, max } = ranges[col.key]
                  return (
                    <td
                      key={col.key}
                      style={{
                        textAlign: 'center', padding: '10px 12px', fontSize: 14, fontWeight: 800,
                        color: 'var(--text-1)', background: heatColor(num, min, max),
                      }}
                    >
                      {typeof raw === 'number' ? raw : raw}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-3)' }}>
        Citizens Bank Park HR counts cover 2015–present (Statcast era) — includes both home games there and this season's road games against Philadelphia.
      </div>
    </div>
  )
}
