'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { pitchColor, pitchLabel, mlbHeadshot } from '@/lib/mlb-api'
import { getTeamLogoUrl } from '@/lib/mlbTeamColors'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
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

// formHr: real HR count in the player's own last-10-real-games window (for
// a pitcher this naturally reads as his last 3-4 real starts, since
// lastNGameDates only counts dates he actually appears in). evidence: the
// real cross-referenced HRs attributed to THIS player specifically.
function scoreFrom(formHr: number, evidence: { matchScore: number; game_date: string }[]): number {
  const formPoints = formHr >= 2 ? 4 : formHr === 1 ? 2 : 0
  const evidencePoints = Math.min(6, evidence.reduce((sum, r) => sum + r.matchScore * recencyWeight(r.game_date), 0) * 3)
  return Math.round(Math.max(0, Math.min(10, formPoints + evidencePoints)))
}

type Evidence = PitchLogRow & { matchScore: number }

function EvidenceCard({
  mlbId, name, teamAbbr, headline, evidence, score,
}: {
  mlbId: number
  name: string
  teamAbbr: string
  headline: string
  evidence: Evidence[]
  score: number
}) {
  const [expanded, setExpanded] = useState(false)
  const distinctPitchTypes = Array.from(new Set(evidence.map(e => e.pitch_type).filter((p): p is string => !!p)))

  return (
    <div style={{ flex: 1, minWidth: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 8 }}>
      <Link href={`/players/${mlbId}`} style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none', color: 'inherit', marginBottom: 6 }}>
        <PlayerAvatar headshot={mlbHeadshot(mlbId)} teamLogo={getTeamLogoUrl(teamAbbr)} teamAbbr={teamAbbr} name={name} size={26} />
        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
      </Link>

      {distinctPitchTypes.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
          {distinctPitchTypes.map(pt => (
            <span key={pt} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 8, color: 'var(--text-3)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: pitchColor(pt), flexShrink: 0 }} />
              {pitchLabel(pt)}
            </span>
          ))}
        </div>
      )}

      <div
        onClick={() => evidence.length > 0 && setExpanded(v => !v)}
        style={{ cursor: evidence.length > 0 ? 'pointer' : 'default' }}
      >
        <div style={{ fontSize: 20, fontWeight: 800, color: evidence.length > 0 ? '#4ade80' : 'var(--text-1)', lineHeight: 1 }}>{evidence.length}</div>
        <div style={{ fontSize: 8, color: 'var(--text-3)', marginTop: 2 }}>
          {headline}{evidence.length > 0 ? (expanded ? ' ▲' : ' ▾') : ''}
        </div>
      </div>

      <div style={{ marginTop: 6 }}>
        <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em' }}>AFFINITY MATCHUP </span>
        <span
          style={{
            fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 5,
            border: `1px solid ${SCORE_COLOR(score)}`, color: SCORE_COLOR(score), background: `${SCORE_COLOR(score)}1a`,
          }}
        >
          {score}/10
        </span>
      </div>

      {expanded && evidence.length > 0 && (
        <div style={{ marginTop: 6, borderTop: '1px solid var(--border)', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {evidence.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 9, color: 'var(--text-2)' }}>
              <span style={{ color: 'var(--text-3)', minWidth: 56, flexShrink: 0 }}>{r.game_date}</span>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: pitchColor(r.pitch_type ?? ''), flexShrink: 0 }} />
              <Link href={`/players/${r.opponent_id}`} style={{ color: 'var(--text-1)', textDecoration: 'none', fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.opponent_name}
              </Link>
              <span style={{ color: 'var(--accent)', flexShrink: 0 }}>{(r.matchScore * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Real, deterministic evidence search: does either player's recent form,
// plus real Statcast affinity between players (Savant's own quality-of-
// contact similarity, ≥0.75 here — a stricter cutoff than the "Vs. Similar
// Arsenal" scope's 0.6), turn up any actual home runs that bear on this
// exact matchup? Two independent directions, each attributed to whichever
// player it's actually evidence about: the batter's own real HRs against
// pitchers similar to this one (his card), or hitters similar to him going
// deep against this exact pitcher (the pitcher's card, since that's
// evidence about HIS vulnerability, not the batter's own track record).
// Both searches run entirely over pitch logs already loaded elsewhere on
// this page (shared fetchPitchLogCached), filtered by the affinity id sets.
export function AffinityMatchupScore({
  batterId, batterName, batterTeamAbbr, pitcherId, pitcherName, pitcherTeamAbbr, pitcherHand,
}: {
  batterId: number
  batterName: string
  batterTeamAbbr: string
  pitcherId: number
  pitcherName: string
  pitcherTeamAbbr: string
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

  // Hitters similar to the batter going deep against this EXACT pitcher —
  // evidence about the PITCHER's own vulnerability, shown on his card.
  const evidenceHitters: Evidence[] = pitcherRows
    .filter(r => r.events === 'home_run' && similarHitterIds.has(r.batter_id))
    .map(r => ({ ...r, matchScore: similarHitterIds.get(r.batter_id)!.matchScore }))
    .sort((a, b) => b.game_date.localeCompare(a.game_date))

  // The batter's own real HRs against a pitcher similar to this one —
  // evidence about the BATTER's own recent capability, shown on his card.
  const evidencePitchers: Evidence[] = batterRows
    .filter(r => r.events === 'home_run' && similarPitcherIds.has(r.pitcher_id))
    .map(r => ({ ...r, matchScore: similarPitcherIds.get(r.pitcher_id)!.matchScore }))
    .sort((a, b) => b.game_date.localeCompare(a.game_date))

  const batterFormHr = computeStatLine(batterRows.filter(r => lastNGameDates(batterRows, 10).has(r.game_date))).hr
  const batterScore = scoreFrom(batterFormHr, evidencePitchers)

  const pitcherFormHr = computeStatLine(pitcherRows.filter(r => lastNGameDates(pitcherRows, 3).has(r.game_date))).hr
  const pitcherScore = scoreFrom(pitcherFormHr, evidenceHitters)

  return (
    <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
      <EvidenceCard
        mlbId={batterId} name={batterName} teamAbbr={batterTeamAbbr}
        headline="HR VS. SIMILAR PITCHER(S)" evidence={evidencePitchers} score={batterScore}
      />
      <EvidenceCard
        mlbId={pitcherId} name={pitcherName} teamAbbr={pitcherTeamAbbr}
        headline="HR TO SIMILAR BATTER(S)" evidence={evidenceHitters} score={pitcherScore}
      />
    </div>
  )
}
