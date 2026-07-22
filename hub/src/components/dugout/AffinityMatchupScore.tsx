'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { pitchColor, pitchLabel, mlbHeadshot } from '@/lib/mlb-api'
import { getTeamLogoUrl } from '@/lib/mlbTeamColors'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { PitchList } from '@/components/players/PitchList'
import { lastNGameDates, computeStatLine, type PitchLogRow } from '@/lib/batterStatsEngine'
import { fetchPitchLogCached } from '@/components/dugout/MatchupPitchBreakdown'
import { scoreFrom } from '@/lib/affinityScore'

// Same fixed hand-color convention used on the row header in DugoutClient —
// right orange, left blue, switch purple.
const HAND_COLOR: Record<'R' | 'L' | 'S', string> = { R: '#fb923c', L: '#60a5fa', S: '#c084fc' }

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

export type Evidence = PitchLogRow & { matchScore: number }

function EvidenceCard({
  mlbId, name, teamAbbr, hand, isPitcherCard, headline, evidence, score, expanded, onToggle,
}: {
  mlbId: number
  name: string
  teamAbbr: string
  hand: 'R' | 'L' | 'S'
  isPitcherCard: boolean
  headline: string
  evidence: Evidence[]
  score: number
  expanded: boolean
  onToggle: () => void
}) {
  const distinctPitchTypes = Array.from(new Set(evidence.map(e => e.pitch_type).filter((p): p is string => !!p)))
  const handLabel = hand === 'S' ? (isPitcherCard ? 'SHP' : 'SHB') : `${hand}H${isPitcherCard ? 'P' : 'B'}`

  return (
    <div style={{ flex: 1, minWidth: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
      <Link href={`/players/${mlbId}`} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit', marginBottom: 8 }}>
        <PlayerAvatar headshot={mlbHeadshot(mlbId)} teamLogo={getTeamLogoUrl(teamAbbr)} teamAbbr={teamAbbr} name={name} size={40} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
          <div style={{ fontSize: 9, fontWeight: 700, color: HAND_COLOR[hand] }}>{handLabel}</div>
        </div>
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

      <div onClick={() => evidence.length > 0 && onToggle()} style={{ cursor: evidence.length > 0 ? 'pointer' : 'default' }}>
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
// Expanding either count reuses PitchList — the same real per-pitch table
// (real opponent avatar, velo/spin/EV/LA/dist/xwOBA/RV) already used
// everywhere else in this dropdown, not a second, thinner view.
type MatchupIdentity = {
  batterId: number
  batterName: string
  batterTeamAbbr: string
  batterBats: string | null
  pitcherId: number
  pitcherName: string
  pitcherTeamAbbr: string
  pitcherHand: 'R' | 'L'
}
type MatchupComputed = {
  batterScore: number
  pitcherScore: number
  evidencePitchers: Evidence[]
  evidenceHitters: Evidence[]
}

// Purely presentational — both AffinityMatchupScore (fetches + computes
// client-side for one Dugout matchup below) and the Synergy page (which
// gets every matchup on today's slate pre-computed server-side in one bulk
// request, see /api/synergy/today) render through this exact same component
// so the two surfaces never visually drift apart.
export function AffinityMatchupCards({
  batterId, batterName, batterTeamAbbr, batterBats, pitcherId, pitcherName, pitcherTeamAbbr, pitcherHand,
  batterScore, pitcherScore, evidencePitchers, evidenceHitters,
}: MatchupIdentity & MatchupComputed) {
  const [batterExpanded, setBatterExpanded] = useState(false)
  const [pitcherExpanded, setPitcherExpanded] = useState(false)
  const batterHand: 'R' | 'L' | 'S' = batterBats === 'L' ? 'L' : batterBats === 'S' ? 'S' : 'R'

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <EvidenceCard
          mlbId={batterId} name={batterName} teamAbbr={batterTeamAbbr} hand={batterHand} isPitcherCard={false}
          headline="HR VS. SIMILAR PITCHER(S)" evidence={evidencePitchers} score={batterScore}
          expanded={batterExpanded} onToggle={() => setBatterExpanded(v => !v)}
        />
        <EvidenceCard
          mlbId={pitcherId} name={pitcherName} teamAbbr={pitcherTeamAbbr} hand={pitcherHand} isPitcherCard={true}
          headline="HR TO SIMILAR BATTER(S)" evidence={evidenceHitters} score={pitcherScore}
          expanded={pitcherExpanded} onToggle={() => setPitcherExpanded(v => !v)}
        />
      </div>
      {batterExpanded && evidencePitchers.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <PitchList rows={evidencePitchers} maxHeight={240} />
        </div>
      )}
      {pitcherExpanded && evidenceHitters.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <PitchList rows={evidenceHitters} maxHeight={240} />
        </div>
      )}
    </div>
  )
}

export function AffinityMatchupScore({
  batterId, batterName, batterTeamAbbr, batterBats, pitcherId, pitcherName, pitcherTeamAbbr, pitcherHand,
}: MatchupIdentity) {
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
    <AffinityMatchupCards
      batterId={batterId} batterName={batterName} batterTeamAbbr={batterTeamAbbr} batterBats={batterBats}
      pitcherId={pitcherId} pitcherName={pitcherName} pitcherTeamAbbr={pitcherTeamAbbr} pitcherHand={pitcherHand}
      batterScore={batterScore} pitcherScore={pitcherScore} evidencePitchers={evidencePitchers} evidenceHitters={evidenceHitters}
    />
  )
}
