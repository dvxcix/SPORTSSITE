'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { pitchLabel } from '@/lib/mlb-api'
import { lastNGameDates, computeStatLine, type PitchLogRow } from '@/lib/batterStatsEngine'
import { fetchPitchLogCached } from '@/components/dugout/MatchupPitchBreakdown'

type AffinitySimilar = { key: string; mlbId: number; hand: string; name: string; matchScore: number }
type AffinityResult = { profile: Record<string, number> | null; similar: AffinitySimilar[] }
const EMPTY_AFFINITY: AffinityResult = { profile: null, similar: [] }

// Separate cache (keyed by role+key+threshold) from MatchupPitchBreakdown's
// own affinity cache — that one fetches at the default 0.6 cutoff for the
// "Vs. Similar Arsenal" scope; this needs a real 0.75-minimum, higher-limit
// list specifically to search for actual HR evidence, a different query.
const affinity75Cache = new Map<string, Promise<AffinityResult>>()
function fetchAffinity75(key: string, role: 'pitcher' | 'hitter') {
  const cacheKey = `${role}:${key}:0.75`
  let p = affinity75Cache.get(cacheKey)
  if (!p) {
    p = fetch(`/api/dugout/affinity?key=${encodeURIComponent(key)}&role=${role}&minScore=0.75&limit=100`).then(r => r.json()).catch(() => EMPTY_AFFINITY)
    affinity75Cache.set(cacheKey, p)
  }
  return p
}

const SCORE_COLOR = (score: number) => {
  if (score >= 8) return '#4ade80'
  if (score >= 6) return '#86efac'
  if (score >= 4) return '#facc15'
  if (score >= 2) return '#fb923c'
  return '#f87171'
}

const daysAgo = (dateStr: string) => (Date.now() - new Date(`${dateStr}T00:00:00Z`).getTime()) / 86400000
const recencyWeight = (dateStr: string) => {
  const d = daysAgo(dateStr)
  if (d <= 14) return 1
  if (d <= 30) return 0.6
  return 0.3
}

type Evidence = PitchLogRow & { name: string; matchScore: number }

// Real, deterministic evidence search: does this batter's recent form, plus
// real Statcast affinity between players (Savant's own quality-of-contact
// similarity, ≥0.75 here — a stricter cutoff than the "Vs. Similar Arsenal"
// scope's 0.6), turn up any actual home runs that bear on this exact
// matchup — either a hitter similar to him going deep against this exact
// pitcher, or him going deep against a pitcher similar to this one. Both
// searches run entirely over pitch logs already loaded elsewhere on this
// page (shared fetchPitchLogCached), just filtered by the affinity id sets.
export function AffinityMatchupScore({
  batterId, batterName, pitcherId, pitcherName, pitcherHand,
}: {
  batterId: number
  batterName: string
  pitcherId: number
  pitcherName: string
  pitcherHand: 'R' | 'L'
}) {
  const [pitcherRows, setPitcherRows] = useState<PitchLogRow[] | null>(null)
  const [batterRows, setBatterRows] = useState<PitchLogRow[] | null>(null)
  const [similarPitchers, setSimilarPitchers] = useState<AffinityResult>(EMPTY_AFFINITY)
  const [similarHitters, setSimilarHitters] = useState<AffinityResult>(EMPTY_AFFINITY)

  useEffect(() => {
    let cancelled = false
    fetchPitchLogCached(pitcherId).then(d => { if (!cancelled) setPitcherRows(d.pitcherRows ?? []) })
    return () => { cancelled = true }
  }, [pitcherId])

  useEffect(() => {
    let cancelled = false
    fetchPitchLogCached(batterId).then(d => { if (!cancelled) setBatterRows(d.batterRows ?? []) })
    return () => { cancelled = true }
  }, [batterId])

  useEffect(() => {
    let cancelled = false
    fetchAffinity75(`${pitcherId}-${pitcherHand}`, 'pitcher').then(d => { if (!cancelled) setSimilarPitchers(d ?? EMPTY_AFFINITY) })
    return () => { cancelled = true }
  }, [pitcherId, pitcherHand])

  useEffect(() => {
    if (!batterRows || batterRows.length === 0) return
    let cancelled = false
    const standCounts = new Map<string, number>()
    for (const r of batterRows) { if (r.stand) standCounts.set(r.stand, (standCounts.get(r.stand) ?? 0) + 1) }
    let dominantStand = 'R'
    let max = -1
    for (const [s, c] of standCounts) { if (c > max) { max = c; dominantStand = s } }
    fetchAffinity75(`${batterId}-${dominantStand}`, 'hitter').then(d => { if (!cancelled) setSimilarHitters(d ?? EMPTY_AFFINITY) })
    return () => { cancelled = true }
  }, [batterId, batterRows])

  if (pitcherRows === null || batterRows === null) return null

  const similarPitcherIds = new Map(similarPitchers.similar.map(s => [s.mlbId, s]))
  const similarHitterIds = new Map(similarHitters.similar.map(s => [s.mlbId, s]))

  // Hitters similar to the batter going deep against this EXACT pitcher.
  const evidenceHitters: Evidence[] = pitcherRows
    .filter(r => r.events === 'home_run' && similarHitterIds.has(r.batter_id))
    .map(r => ({ ...r, name: similarHitterIds.get(r.batter_id)!.name, matchScore: similarHitterIds.get(r.batter_id)!.matchScore }))
    .sort((a, b) => b.game_date.localeCompare(a.game_date))

  // This batter going deep against a pitcher similar to the one he's facing.
  const evidencePitchers: Evidence[] = batterRows
    .filter(r => r.events === 'home_run' && similarPitcherIds.has(r.pitcher_id))
    .map(r => ({ ...r, name: similarPitcherIds.get(r.pitcher_id)!.name, matchScore: similarPitcherIds.get(r.pitcher_id)!.matchScore }))
    .sort((a, b) => b.game_date.localeCompare(a.game_date))

  const last10Dates = lastNGameDates(batterRows, 10)
  const last10Stats = computeStatLine(batterRows.filter(r => last10Dates.has(r.game_date)))
  const formPoints = last10Stats.hr >= 2 ? 4 : last10Stats.hr === 1 ? 2 : 0
  const evidencePoints = Math.min(6, [...evidenceHitters, ...evidencePitchers].reduce((sum, r) => sum + r.matchScore * recencyWeight(r.game_date), 0) * 3)
  const score = Math.round(Math.max(0, Math.min(10, formPoints + evidencePoints)))

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em' }}>AFFINITY MATCHUP</div>
        <div
          style={{
            fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 6,
            border: `1px solid ${SCORE_COLOR(score)}`, color: SCORE_COLOR(score), background: `${SCORE_COLOR(score)}1a`,
          }}
        >
          {score}/10
        </div>
      </div>

      {evidenceHitters.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 8, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.05em', marginBottom: 4 }}>
            SIMILAR BATTERS VS. {pitcherName.toUpperCase()} ({evidenceHitters.length})
          </div>
          {evidenceHitters.slice(0, 5).map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--text-2)', padding: '2px 0' }}>
              <span style={{ color: 'var(--text-3)', minWidth: 66 }}>{r.game_date}</span>
              <Link href={`/players/${r.batter_id}`} style={{ color: 'var(--text-1)', textDecoration: 'none', fontWeight: 700, flex: 1 }}>{r.name}</Link>
              <span style={{ color: 'var(--text-3)' }}>{pitchLabel(r.pitch_type ?? '')}</span>
              <span style={{ color: 'var(--accent)' }}>{(r.matchScore * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}

      {evidencePitchers.length > 0 && (
        <div>
          <div style={{ fontSize: 8, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.05em', marginBottom: 4 }}>
            {batterName.toUpperCase()} VS. SIMILAR PITCHERS ({evidencePitchers.length})
          </div>
          {evidencePitchers.slice(0, 5).map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--text-2)', padding: '2px 0' }}>
              <span style={{ color: 'var(--text-3)', minWidth: 66 }}>{r.game_date}</span>
              <Link href={`/players/${r.pitcher_id}`} style={{ color: 'var(--text-1)', textDecoration: 'none', fontWeight: 700, flex: 1 }}>{r.name}</Link>
              <span style={{ color: 'var(--text-3)' }}>{pitchLabel(r.pitch_type ?? '')}</span>
              <span style={{ color: 'var(--accent)' }}>{(r.matchScore * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
