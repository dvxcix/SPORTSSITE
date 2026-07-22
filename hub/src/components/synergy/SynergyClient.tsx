'use client'

import { useEffect, useMemo, useState } from 'react'
import { AffinityMatchupCards, type Evidence } from '@/components/dugout/AffinityMatchupScore'

type SynergyMatchup = {
  gameKey: string
  lineupConfirmed: boolean
  batterId: number; batterName: string; batterTeamAbbr: string; batterBats: string | null
  pitcherId: number; pitcherName: string; pitcherTeamAbbr: string; pitcherHand: 'R' | 'L'
  batterScore: number; pitcherScore: number
  evidencePitchers: Evidence[]; evidenceHitters: Evidence[]
}

type SortMode = 'best' | 'batter' | 'pitcher'

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: 'best', label: 'Best of Either' },
  { key: 'batter', label: 'Batter Score' },
  { key: 'pitcher', label: 'Pitcher Score' },
]

const scoreFor = (m: SynergyMatchup, mode: SortMode) =>
  mode === 'batter' ? m.batterScore : mode === 'pitcher' ? m.pitcherScore : Math.max(m.batterScore, m.pitcherScore)

export function SynergyClient() {
  const [matchups, setMatchups] = useState<SynergyMatchup[] | null>(null)
  const [error, setError] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>('best')

  useEffect(() => {
    let cancelled = false
    fetch('/api/synergy/today')
      .then(r => r.json())
      .then(d => { if (!cancelled) setMatchups(d.matchups ?? []) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [])

  const sorted = useMemo(() => {
    if (!matchups) return []
    return [...matchups].sort((a, b) => scoreFor(b, sortMode) - scoreFor(a, sortMode))
  }, [matchups, sortMode])

  if (error) return <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '20px 0' }}>Couldn&apos;t load today&apos;s matchups.</div>
  if (matchups === null) return <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '20px 0' }}>Loading…</div>
  if (matchups.length === 0) return <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '20px 0' }}>No games today.</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em' }}>SORT BY</span>
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => setSortMode(opt.key)}
            style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: '1px solid var(--border)',
              background: sortMode === opt.key ? 'var(--accent)' : 'var(--surface)',
              color: sortMode === opt.key ? 'var(--accent-fg)' : 'var(--text-2)',
            }}
          >
            {opt.label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>{matchups.length} matchups</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sorted.map(m => (
          <div key={`${m.batterId}-${m.pitcherId}-${m.gameKey}`} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em', marginBottom: 4 }}>
              <span>{m.gameKey}</span>
              {!m.lineupConfirmed && <span style={{ color: 'var(--gold)' }}>PROJECTED LINEUP</span>}
            </div>
            <AffinityMatchupCards
              batterId={m.batterId} batterName={m.batterName} batterTeamAbbr={m.batterTeamAbbr} batterBats={m.batterBats}
              pitcherId={m.pitcherId} pitcherName={m.pitcherName} pitcherTeamAbbr={m.pitcherTeamAbbr} pitcherHand={m.pitcherHand}
              batterScore={m.batterScore} pitcherScore={m.pitcherScore}
              evidencePitchers={m.evidencePitchers} evidenceHitters={m.evidenceHitters}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
