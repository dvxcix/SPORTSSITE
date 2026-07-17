'use client'

import { useEffect, useMemo, useState } from 'react'
import { heat } from '@/components/pitcher-report/MatchupTables'
import { cardStyle, sectionTitleStyle, windowTag } from './PlayerPageClient'

export type ZoneRow = { zone: number | null; is_swing: boolean; is_whiff: boolean; run_value: number | null }

// Row-major top-left to bottom-right — same convention as PitchZoneHeatmap.
const CORE_ZONES = [1, 2, 3, 4, 5, 6, 7, 8, 9]

function zoneCell(rows: ZoneRow[]) {
  const rv = rows.map(r => r.run_value).filter((v): v is number => v != null)
  return { count: rows.length, avgRunValue: rv.length ? rv.reduce((a, b) => a + b, 0) / rv.length : null }
}
function binByZone(rows: ZoneRow[]): Map<number, ZoneRow[]> {
  const m = new Map<number, ZoneRow[]>()
  for (const r of rows) {
    if (r.zone == null) continue
    const list = m.get(r.zone)
    if (list) list.push(r); else m.set(r.zone, [r])
  }
  return m
}

// Both a batter's own zone-level run_value and a pitcher's own zone-level
// run_value are the same underlying stat (Savant's delta_run_exp, averaged
// per pitch in that zone) — negative always means "bad for the offense" and
// positive always means "good for the offense," regardless of whose row set
// it was computed from. That shared sign convention is what makes a simple
// additive combination meaningful: a batter who's weak in a zone (negative)
// facing a pitcher who dominates that same zone (also negative) combine to a
// strongly negative estimate — both signals agree it's a bad zone for the
// batter. This is a deliberately simple estimate (sum of two independent
// season averages), not a real projection model — shown alongside real
// sample sizes so a thin sample reads as exactly that.
export function ZoneScoreCard({ pageRole, myName, myRows, opponentId, opponentName }: {
  pageRole: 'batter' | 'pitcher'
  myName: string
  myRows: ZoneRow[]
  opponentId: number
  opponentName: string
}) {
  const [oppRows, setOppRows] = useState<ZoneRow[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setOppRows(null)
    fetch(`/api/players/${opponentId}/pitch-log`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        setOppRows(pageRole === 'batter' ? (d.pitcherRows ?? []) : (d.batterRows ?? []))
      })
      .catch(() => { if (!cancelled) setOppRows([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [opponentId, pageRole])

  const myByZone = useMemo(() => binByZone(myRows), [myRows])
  const oppByZone = useMemo(() => binByZone(oppRows ?? []), [oppRows])

  const batterByZone = pageRole === 'batter' ? myByZone : oppByZone
  const pitcherByZone = pageRole === 'batter' ? oppByZone : myByZone
  const batterLabel = pageRole === 'batter' ? myName : opponentName
  const pitcherLabel = pageRole === 'batter' ? opponentName : myName
  // green = good for whichever player's page this card is rendered on.
  const dir = pageRole === 'batter' ? 'hi' : 'lo'

  if (loading) {
    return (
      <div style={cardStyle}>
        <div style={sectionTitleStyle}>Zone Score</div>
        <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Loading {opponentName}&apos;s zone profile…</div>
      </div>
    )
  }

  const cells = CORE_ZONES.map(z => {
    const b = zoneCell(batterByZone.get(z) ?? [])
    const p = zoneCell(pitcherByZone.get(z) ?? [])
    const combined = b.avgRunValue != null && p.avgRunValue != null ? b.avgRunValue + p.avgRunValue : null
    return { zone: z, batterCount: b.count, pitcherCount: p.count, combined }
  })
  const combinedValues = cells.map(c => c.combined)

  return (
    <div style={cardStyle}>
      <div style={sectionTitleStyle}>
        Zone Score
        <span style={windowTag}>{batterLabel} vs {pitcherLabel}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14, lineHeight: 1.5 }}>
        {batterLabel}&apos;s own zone tendencies + {pitcherLabel}&apos;s own zone tendencies, combined per zone — green favors {pageRole === 'batter' ? batterLabel : pitcherLabel}. A simplified estimate from each player&apos;s season averages, not a full projection model — check the sample counts (batter · pitcher pitches) before trusting a thin cell.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 72px)', gridTemplateRows: 'repeat(3, 72px)', gap: 3 }}>
        {cells.map(c => (
          <div
            key={c.zone}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)',
              ...heat(c.combined, combinedValues, dir),
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>
              {c.combined == null ? '—' : `${c.combined >= 0 ? '+' : ''}${c.combined.toFixed(2)}`}
            </span>
            <span style={{ fontSize: 8, color: 'var(--text-3)', marginTop: 2 }}>{c.batterCount}b · {c.pitcherCount}p</span>
          </div>
        ))}
      </div>
    </div>
  )
}
