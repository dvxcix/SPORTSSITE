'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import { pitchColor, pitchLabel, mlbHeadshot } from '@/lib/mlb-api'
import { getTeamLogoUrl } from '@/lib/mlbTeamColors'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { Tooltip } from '@/components/ui/tooltip-card'
import { heat, SortableTH, type SortState, toggleSortState, cmpNullsLast, cmpAny } from '@/components/pitcher-report/MatchupTables'
import { ZoneGrid, ZONE_METRICS, type ZoneMetricKey } from '@/components/players/ZoneGrid'
import { PitchList } from '@/components/players/PitchList'
import { ToggleBtn } from '@/components/players/PlayerPageClient'
import { computeStatLine, lastNGameDates, pitchMix, BATTER_STAT_COLS, PITCHER_STAT_COLS, type PitchLogRow, type BatterStats } from '@/lib/batterStatsEngine'
import { PITCHER_RECENCY, BATTER_SCOPES } from '@/components/slate/PitcherVsLineup'

// Same fixed hand-color convention as the batter rows above this drilldown
// (see DugoutClient.tsx's handColor) — right orange, left blue — so a
// pitcher's hand reads consistently with every batter's own hand badge.
const HAND_COLOR: Record<'R' | 'L', string> = { R: '#fb923c', L: '#60a5fa' }

// Real per-pitch data is player-scoped (thousands of rows for a full-time
// player), not per-matchup — the same starter's log is needed by every
// batter he's facing tonight, and the same batter's log is needed however
// many times his row gets expanded. One shared in-memory cache per mlb_id
// keeps re-expanding a row (or two batters facing the same starter) from
// re-fetching identical data. Deliberately module-scope, not React state —
// it just needs to outlive individual component instances for the page
// session, not survive a reload.
const pitchLogCache = new Map<number, Promise<{ pitcherRows: PitchLogRow[]; batterRows: PitchLogRow[] }>>()
export function fetchPitchLogCached(mlbId: number) {
  let p = pitchLogCache.get(mlbId)
  if (!p) {
    p = fetch(`/api/players/${mlbId}/pitch-log`).then(r => r.json()).catch(() => ({ pitcherRows: [], batterRows: [] }))
    pitchLogCache.set(mlbId, p)
  }
  return p
}

type TeamBullpen = {
  bullpen: { era: number | null; opsVsLhb: number | null; opsVsRhb: number | null; hrPer9: number | null; whip: number | null; k9: number | null; tier: string | null; updatedAt: string | null } | null
  relievers: { mlbId: number; name: string | null; role: string | null; era: number | null; ip: number | null; hrPer9: number | null; vsLhbOps: number | null; vsRhbOps: number | null; appearances: number | null; saves: number | null; holds: number | null }[]
}
const EMPTY_BULLPEN: TeamBullpen = { bullpen: null, relievers: [] }
const bullpenCache = new Map<string, Promise<TeamBullpen>>()
function fetchBullpenCached(teamAbbr: string) {
  let p = bullpenCache.get(teamAbbr)
  if (!p) {
    p = fetch(`/api/dugout/team-bullpen?teamAbbr=${teamAbbr}`).then(r => r.json()).catch(() => EMPTY_BULLPEN)
    bullpenCache.set(teamAbbr, p)
  }
  return p
}

const TIER_LABEL: Record<string, string> = { elite: 'Elite', good: 'Good', avg: 'Average', leaky: 'Leaky', disaster: 'Disaster' }
const TIER_COLOR: Record<string, string> = { elite: '#4ade80', good: '#86efac', avg: '#facc15', leaky: '#fb923c', disaster: '#f87171' }

// Savant's own "Affinity" tool — real batted-ball quality-of-contact
// similarity between two players (barrel/solid-contact/weak-topped-under/
// flare-burner rates), NOT pitch mix or velocity. "Similar pitchers" means
// hitters tend to make contact against them in a similar quality
// distribution, a legitimate proxy for widening a too-small real sample
// against one specific arm. See affinitySync.ts for the ingestion pipeline.
type AffinitySimilar = { key: string; mlbId: number; hand: string; name: string; matchScore: number }
type AffinityResult = { profile: Record<string, number> | null; similar: AffinitySimilar[] }
const EMPTY_AFFINITY: AffinityResult = { profile: null, similar: [] }
const affinityCache = new Map<string, Promise<AffinityResult>>()
function fetchAffinityCached(key: string, role: 'pitcher' | 'hitter') {
  const cacheKey = `${role}:${key}`
  let p = affinityCache.get(cacheKey)
  if (!p) {
    p = fetch(`/api/dugout/affinity?key=${encodeURIComponent(key)}&role=${role}`).then(r => r.json()).catch(() => EMPTY_AFFINITY)
    affinityCache.set(cacheKey, p)
  }
  return p
}
// "Season" toggle only — not exposed on the pitcher's own recency/hand
// filters, since affinity is a season-long profile, not something that
// varies by his last-3-starts window.
const EXTRA_BATTER_SCOPES = [{ key: 'vsSimilarArsenal', label: 'Vs. Similar Arsenal' }] as const

const HAND_FILTERS_BATTER_SIDE = [
  { key: 'all', label: 'All' }, { key: 'R', label: 'vs RHB' }, { key: 'L', label: 'vs LHB' },
] as const
const HAND_FILTERS_PITCHER_SIDE = [
  { key: 'all', label: 'All' }, { key: 'R', label: 'vs RHP' }, { key: 'L', label: 'vs LHP' },
] as const

const r3 = (v: number | null) => (v == null ? '—' : v.toFixed(3).replace(/^0\./, '.').replace(/^-0\./, '-.'))
const p1 = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`)
const i0 = (v: number | null) => (v == null ? '—' : String(v))

function groupByPitchType(rows: PitchLogRow[]): { pitchType: string; rows: PitchLogRow[] }[] {
  const map = new Map<string, PitchLogRow[]>()
  for (const r of rows) {
    if (!r.pitch_type) continue
    if (!map.has(r.pitch_type)) map.set(r.pitch_type, [])
    map.get(r.pitch_type)!.push(r)
  }
  return Array.from(map, ([pitchType, rows]) => ({ pitchType, rows })).sort((a, b) => b.rows.length - a.rows.length)
}

type PitcherMixRow = { pitchType: string; rows: PitchLogRow[]; stats: BatterStats }
type BatterMixRow = { pitchType: string; batterRowsForPitch: PitchLogRow[]; pitcherRowsForPitch: PitchLogRow[]; batterStats: BatterStats }

function BullpenBadge({ teamAbbr, bullpen }: { teamAbbr: string; bullpen: TeamBullpen['bullpen'] }) {
  if (!bullpen || !bullpen.tier) return null
  const color = TIER_COLOR[bullpen.tier] ?? 'var(--text-3)'
  return (
    <Tooltip
      content={
        <div style={{ fontSize: 11, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 800, marginBottom: 2 }}>{teamAbbr} Bullpen — {TIER_LABEL[bullpen.tier] ?? bullpen.tier}</div>
          <div>ERA: {bullpen.era ?? '—'}</div>
          <div>vs LHB OPS: {bullpen.opsVsLhb ?? '—'} · vs RHB OPS: {bullpen.opsVsRhb ?? '—'}</div>
          <div>HR/9: {bullpen.hrPer9 ?? '—'}</div>
        </div>
      }
    >
      <span
        style={{
          fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6, cursor: 'default',
          border: `1px solid ${color}`, color, background: `${color}1a`,
        }}
      >
        BULLPEN · {TIER_LABEL[bullpen.tier] ?? bullpen.tier.toUpperCase()}{bullpen.era != null ? ` · ${bullpen.era.toFixed(2)} ERA` : ''}
      </span>
    </Tooltip>
  )
}

// The real matchup panel: this pitcher's actual pitch-by-pitch log (real
// arsenal, recency-selectable, full stat-column set, filterable by the
// batter hand he actually faced) next to this batter's actual pitch-by-
// pitch results against that same arsenal (recency-selectable
// independently, filterable by pitcher hand, plus a real "Vs. This Team"
// scope against the opposing bullpen's actual current relievers) — the
// same engine, column definitions, and recency-window concept Slate
// Breakdown's PitcherVsLineup uses (batterStatsEngine.ts), just condensed
// to the one matchup a Dugout row-expand actually needs instead of a whole
// lineup table.
export function MatchupPitchBreakdown({
  batterId, batterName, batterBats, batterTeamAbbr, pitcherId, pitcherName, pitcherHand, pitcherTeamAbbr,
}: {
  batterId: number
  batterName: string
  batterBats: string | null
  batterTeamAbbr: string
  pitcherId: number
  pitcherName: string
  pitcherHand: 'R' | 'L'
  pitcherTeamAbbr: string
}) {
  const [pitcherRows, setPitcherRows] = useState<PitchLogRow[] | null>(null)
  const [batterRows, setBatterRows] = useState<PitchLogRow[] | null>(null)
  const [bullpen, setBullpen] = useState<TeamBullpen>(EMPTY_BULLPEN)
  const [pitcherAffinity, setPitcherAffinity] = useState<AffinityResult>(EMPTY_AFFINITY)
  const [batterAffinity, setBatterAffinity] = useState<AffinityResult>(EMPTY_AFFINITY)
  const [pitcherRecency, setPitcherRecency] = useState<typeof PITCHER_RECENCY[number]['key']>('season')
  const [batterScope, setBatterScope] = useState<typeof BATTER_SCOPES[number]['key'] | typeof EXTRA_BATTER_SCOPES[number]['key']>('season')
  const [pitcherHandFilter, setPitcherHandFilter] = useState<'all' | 'R' | 'L'>('all')
  const [batterHandFilter, setBatterHandFilter] = useState<'all' | 'R' | 'L'>('all')
  const [zoneMetric, setZoneMetric] = useState<ZoneMetricKey>('run_value')
  const [pitSort, setPitSort] = useState<SortState>({ col: 'pitches', dir: 'desc' })
  const [batPitchSort, setBatPitchSort] = useState<SortState>({ col: 'pa', dir: 'desc' })
  const [expandedPitch, setExpandedPitch] = useState<string | null>(null)
  const [expandedPitcherPitch, setExpandedPitcherPitch] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setPitcherRows(null)
    fetchPitchLogCached(pitcherId).then(d => { if (!cancelled) setPitcherRows(d.pitcherRows ?? []) })
    return () => { cancelled = true }
  }, [pitcherId])

  useEffect(() => {
    let cancelled = false
    setBatterRows(null)
    fetchPitchLogCached(batterId).then(d => { if (!cancelled) setBatterRows(d.batterRows ?? []) })
    return () => { cancelled = true }
  }, [batterId])

  useEffect(() => {
    let cancelled = false
    setBullpen(EMPTY_BULLPEN)
    fetchBullpenCached(pitcherTeamAbbr).then(d => { if (!cancelled) setBullpen(d ?? EMPTY_BULLPEN) })
    return () => { cancelled = true }
  }, [pitcherTeamAbbr])

  useEffect(() => {
    let cancelled = false
    setPitcherAffinity(EMPTY_AFFINITY)
    fetchAffinityCached(`${pitcherId}-${pitcherHand}`, 'pitcher').then(d => { if (!cancelled) setPitcherAffinity(d ?? EMPTY_AFFINITY) })
    return () => { cancelled = true }
  }, [pitcherId, pitcherHand])

  // The batter's own key needs his REAL dominant batting side this season
  // (not just the `bats` prop, which reads "S" for switch hitters — Savant's
  // affinity keys are per-side, e.g. a switch hitter has a separate "-L" and
  // "-R" profile) — waits for his pitch log so this can read real `stand`
  // values off it instead of guessing.
  useEffect(() => {
    if (!batterRows || batterRows.length === 0) return
    let cancelled = false
    const standCounts = new Map<string, number>()
    for (const r of batterRows) { if (r.stand) standCounts.set(r.stand, (standCounts.get(r.stand) ?? 0) + 1) }
    let dominantStand = batterBats === 'L' ? 'L' : 'R'
    let max = -1
    for (const [s, c] of standCounts) { if (c > max) { max = c; dominantStand = s } }
    setBatterAffinity(EMPTY_AFFINITY)
    fetchAffinityCached(`${batterId}-${dominantStand}`, 'hitter').then(d => { if (!cancelled) setBatterAffinity(d ?? EMPTY_AFFINITY) })
    return () => { cancelled = true }
  }, [batterId, batterRows, batterBats])

  if (pitcherRows === null || batterRows === null) {
    return <div style={{ fontSize: 11, color: 'var(--text-3)', padding: '8px 0' }}>Loading real pitch-log matchup data…</div>
  }

  // ── Pitcher's own arsenal — recency window, then optionally narrowed to
  // only the pitches he threw against right- or left-handed batters. ──────
  const pitcherWindowDates = pitcherRecency === 'season' ? null : lastNGameDates(pitcherRows, Number(pitcherRecency))
  const pitcherWindowRows = pitcherWindowDates ? pitcherRows.filter(r => pitcherWindowDates.has(r.game_date)) : pitcherRows
  const pitcherHandRows = pitcherHandFilter === 'all' ? pitcherWindowRows : pitcherWindowRows.filter(r => r.stand === pitcherHandFilter)
  const mix = pitchMix(pitcherHandRows)
  const pitcherMixRows: PitcherMixRow[] = mix.map(m => {
    const rows = pitcherHandRows.filter(r => r.pitch_type === m.pitchType)
    return { pitchType: m.pitchType, rows, stats: { ...computeStatLine(rows), usage: m.usage } }
  })

  // ── Batter's own results — hand-filtered by the throwing pitcher's hand
  // first (so "his last 5 games" means his last 5 games against that hand
  // when a hand filter is active), then scoped. Every scope here reflects
  // the batter's REAL activity in that window — season/L-N are his true
  // recent form against whoever he actually faced, not narrowed to pitch
  // types this specific pitcher happens to throw. Confirmed live: a real,
  // on-file home run (Nick Gonzales off Gavin Williams, a real curveball,
  // 4 days back) was invisible under "Last 5 Games" purely because the
  // opposing pitcher in this panel doesn't throw a true curveball — that
  // arsenal-matching only makes sense for "Vs. This Pitcher"/"Vs. This
  // Team" below, where the pitch source is genuinely restricted to begin
  // with, not for the batter's own unrelated recent-form window. "Vs. This
  // Team" pulls the real current bullpen roster (mlb-party's
  // reliever_ratings) instead of this one starter's own arsenal — a
  // genuinely different set of pitchers and pitch types. ─────────────────
  const relieverIds = new Set(bullpen.relievers.map(r => r.mlbId))
  const similarPitcherIds = new Set(pitcherAffinity.similar.map(s => s.mlbId))
  const similarHitterIds = new Set(batterAffinity.similar.map(s => s.mlbId))
  const batterHandRows = batterHandFilter === 'all' ? batterRows : batterRows.filter(r => r.p_throws === batterHandFilter)

  let batterVsMixRows: PitchLogRow[]
  if (batterScope === 'vsTeam') {
    batterVsMixRows = batterHandRows.filter(r => relieverIds.has(r.pitcher_id))
  } else if (batterScope === 'vsSimilarArsenal') {
    batterVsMixRows = batterHandRows.filter(r => similarPitcherIds.has(r.pitcher_id))
  } else {
    const batterWindowDates = batterScope === 'season' || batterScope === 'vsPitcher' ? null : lastNGameDates(batterHandRows, Number(batterScope))
    batterVsMixRows = batterHandRows.filter(r => {
      if (batterScope === 'vsPitcher' && r.pitcher_id !== pitcherId) return false
      if (batterWindowDates && !batterWindowDates.has(r.game_date)) return false
      return true
    })
  }
  const batterOverall = computeStatLine(batterVsMixRows)

  const batterMixRows: BatterMixRow[] = groupByPitchType(batterVsMixRows).map(g => ({
    pitchType: g.pitchType,
    batterRowsForPitch: g.rows,
    // No single arm to compare against once "Vs. This Team"/"Vs. Similar
    // Arsenal" pool several different pitchers together — the per-pitch
    // expand below only shows a pitcher-side zone when there's actually one
    // real pitcher it means.
    pitcherRowsForPitch: (batterScope === 'vsTeam' || batterScope === 'vsSimilarArsenal') ? [] : pitcherHandRows.filter(r => r.pitch_type === g.pitchType),
    batterStats: { ...computeStatLine(g.rows), usage: batterVsMixRows.length > 0 ? (g.rows.length / batterVsMixRows.length) * 100 : null },
  }))

  const onSortPit = (col: string) => setPitSort(prev => toggleSortState(prev, col))
  const activePitSort = pitSort ?? { col: 'pitches', dir: 'desc' as const }
  const sortedPitRows = [...pitcherMixRows].sort((a, b) => {
    if (activePitSort.col === 'pitch') return cmpAny(pitchLabel(a.pitchType), pitchLabel(b.pitchType), activePitSort.dir)
    return cmpNullsLast((a.stats as any)[activePitSort.col], (b.stats as any)[activePitSort.col], activePitSort.dir)
  })
  const pitPoolByCol = Object.fromEntries(PITCHER_STAT_COLS.map(c => [c.key, pitcherMixRows.map(r => (r.stats as any)[c.key])]))

  // How has this pitcher (in his currently selected recency/hand window)
  // actually done against real hitters whose contact-quality profile is
  // similar to the batter in this matchup — a wider, real sample when the
  // batter himself has little or no history against this exact arm.
  const similarHitterRows = pitcherHandRows.filter(r => similarHitterIds.has(r.batter_id))
  const similarHitterStats = computeStatLine(similarHitterRows)

  const onSortBatPitch = (col: string) => setBatPitchSort(prev => toggleSortState(prev, col))
  const activeBatPitchSort = batPitchSort ?? { col: 'pa', dir: 'desc' as const }
  const sortedBatPitchRows = [...batterMixRows].sort((a, b) => {
    if (activeBatPitchSort.col === 'pitch') return cmpAny(pitchLabel(a.pitchType), pitchLabel(b.pitchType), activeBatPitchSort.dir)
    return cmpNullsLast((a.batterStats as any)[activeBatPitchSort.col], (b.batterStats as any)[activeBatPitchSort.col], activeBatPitchSort.dir)
  })
  const batPoolByCol = Object.fromEntries(BATTER_STAT_COLS.map(c => [c.key, batterMixRows.map(r => (r.batterStats as any)[c.key])]))

  const zoneMetricConfig = ZONE_METRICS.find(m => m.key === zoneMetric)!

  return (
    <div style={{ minWidth: 460, flex: '1 1 520px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <Link
          href={`/players/${pitcherId}`}
          style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit' }}
        >
          <PlayerAvatar headshot={mlbHeadshot(pitcherId)} teamLogo={getTeamLogoUrl(pitcherTeamAbbr)} teamAbbr={pitcherTeamAbbr} name={pitcherName} size={32} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-1)' }}>{pitcherName}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: HAND_COLOR[pitcherHand] }}>{pitcherHand}HP</div>
          </div>
        </Link>
        <BullpenBadge teamAbbr={pitcherTeamAbbr} bullpen={bullpen.bullpen} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
          {PITCHER_RECENCY.map(o => <ToggleBtn key={o.key} active={pitcherRecency === o.key} onClick={() => setPitcherRecency(o.key)}>{o.label}</ToggleBtn>)}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em' }}>ARSENAL FILTER</span>
        {HAND_FILTERS_BATTER_SIDE.map(o => <ToggleBtn key={o.key} active={pitcherHandFilter === o.key} onClick={() => setPitcherHandFilter(o.key)}>{o.label}</ToggleBtn>)}
      </div>

      {/* Pitcher's real arsenal — full stat-column set, same as Slate
          Breakdown's own pitcher mix table. */}
      <div style={{ overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 16 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <SortableTH label="Pitch" colKey="pitch" sort={pitSort} onSort={onSortPit} align="left" />
              {PITCHER_STAT_COLS.map(c => <SortableTH key={c.key} label={c.label} colKey={c.key} sort={pitSort} onSort={onSortPit} />)}
            </tr>
          </thead>
          <tbody>
            {sortedPitRows.length === 0 ? (
              <tr><td colSpan={PITCHER_STAT_COLS.length + 1} style={{ padding: '8px', color: 'var(--text-3)', fontSize: 11 }}>No tracked pitches in this window.</td></tr>
            ) : sortedPitRows.map(r => {
              const isOpen = expandedPitcherPitch === r.pitchType
              return (
                <Fragment key={r.pitchType}>
                  <tr
                    onClick={() => setExpandedPitcherPitch(isOpen ? null : r.pitchType)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isOpen ? 'var(--accent-dim)' : undefined }}
                  >
                    <td style={{ padding: '6px 8px', fontWeight: 700, color: isOpen ? 'var(--accent)' : 'var(--text-1)', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: pitchColor(r.pitchType), marginRight: 6, verticalAlign: 'middle' }} />
                      {pitchLabel(r.pitchType)}
                      <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--text-3)' }}>{isOpen ? '▲' : '▾'}</span>
                    </td>
                    {PITCHER_STAT_COLS.map(c => {
                      const v = (r.stats as any)[c.key]
                      return (
                        <td key={c.key} style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', ...(c.noHeat ? {} : heat(v, pitPoolByCol[c.key], c.dir)) }}>
                          {c.fmt(v)}
                        </td>
                      )
                    })}
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={PITCHER_STAT_COLS.length + 1} style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.02)' }}>
                        {r.rows.length === 0 ? (
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{pitcherName} has no tracked pitches of this type in the current window.</div>
                        ) : (
                          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                            <div>
                              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
                                {ZONE_METRICS.map(m => <ToggleBtn key={m.key} active={zoneMetric === m.key} onClick={() => setZoneMetric(m.key)}>{m.label}</ToggleBtn>)}
                              </div>
                              <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.04em', marginBottom: 4 }}>{pitcherName}&apos;S ZONE</div>
                              <ZoneGrid rows={r.rows} metric={zoneMetric} dir={zoneMetricConfig.dir} cellSize={44} />
                            </div>
                            <div style={{ flex: 1, minWidth: 320 }}>
                              <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.04em', marginBottom: 4 }}>
                                {r.rows.length} INDIVIDUAL PITCH{r.rows.length === 1 ? '' : 'ES'} · ALL BATTERS FACED
                              </div>
                              <PitchList rows={r.rows} maxHeight={220} />
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Real Savant Affinity data: how this pitcher (current recency/hand
          window) has actually performed against hitters whose batted-ball
          quality-of-contact profile is similar to the batter below — a
          wider real sample when he has little or no history against this
          exact arm. Plain value tiles, no heat (a single aggregate has no
          real pool to heat-map against). */}
      {batterAffinity.similar.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Tooltip
            content={
              <div style={{ fontSize: 11, lineHeight: 1.6 }}>
                <div style={{ fontWeight: 800, marginBottom: 2 }}>Most similar to {batterName}</div>
                {batterAffinity.similar.slice(0, 8).map(s => (
                  <div key={s.key}>{s.name} — {(s.matchScore * 100).toFixed(0)}%</div>
                ))}
              </div>
            }
          >
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em', marginBottom: 6, cursor: 'default' }}>
              VS HITTERS SIMILAR TO {batterName.toUpperCase()} ({batterAffinity.similar.length})
            </div>
          </Tooltip>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {([
              ['PA', i0(similarHitterStats.pa)], ['AVG', r3(similarHitterStats.avg)], ['OBP', r3(similarHitterStats.obp)], ['SLG', r3(similarHitterStats.slg)],
              ['WHIFF%', p1(similarHitterStats.whiffPct)], ['HH%', p1(similarHitterStats.hardHitPct)], ['xwOBA(Ct)', r3(similarHitterStats.xwobaContact)],
              ['HR', i0(similarHitterStats.hr)], ['K', i0(similarHitterStats.k)], ['BB', i0(similarHitterStats.bb)],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} style={{ padding: '5px 9px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, minWidth: 56 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>{value}</div>
                <div style={{ fontSize: 8, color: 'var(--text-3)', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <Link
          href={`/players/${batterId}`}
          style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit' }}
        >
          <PlayerAvatar headshot={mlbHeadshot(batterId)} teamLogo={getTeamLogoUrl(batterTeamAbbr)} teamAbbr={batterTeamAbbr} name={batterName} size={28} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-1)' }}>{batterName}</div>
            {batterBats && <div style={{ fontSize: 10, fontWeight: 700, color: HAND_COLOR[batterBats === 'L' ? 'L' : 'R'] }}>{batterBats}HB</div>}
          </div>
        </Link>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
          {[...BATTER_SCOPES, ...EXTRA_BATTER_SCOPES].map(o => <ToggleBtn key={o.key} active={batterScope === o.key} onClick={() => setBatterScope(o.key)}>{o.label}</ToggleBtn>)}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em' }}>OPPOSING HAND</span>
        {HAND_FILTERS_PITCHER_SIDE.map(o => <ToggleBtn key={o.key} active={batterHandFilter === o.key} onClick={() => setBatterHandFilter(o.key)}>{o.label}</ToggleBtn>)}
      </div>
      {batterScope === 'vsTeam' && (
        <div style={{ fontSize: 9, color: 'var(--text-3)', marginBottom: 10 }}>
          {bullpen.relievers.length === 0 ? `No current reliever ratings on file for ${pitcherTeamAbbr}.` : `Every tracked pitch vs. ${pitcherTeamAbbr}'s ${bullpen.relievers.length} rated reliever${bullpen.relievers.length === 1 ? '' : 's'}.`}
        </div>
      )}
      {batterScope === 'vsSimilarArsenal' && (
        <div style={{ fontSize: 9, color: 'var(--text-3)', marginBottom: 10 }}>
          {pitcherAffinity.similar.length === 0 ? `No similar-arsenal data on file for ${pitcherName}.` : `Every tracked pitch vs. ${pitcherAffinity.similar.length} pitcher${pitcherAffinity.similar.length === 1 ? '' : 's'} with a real Statcast contact-quality profile similar to ${pitcherName}'s.`}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
        {([
          ['pa', 'PA', i0(batterOverall.pa)], ['avg', 'AVG', r3(batterOverall.avg)], ['obp', 'OBP', r3(batterOverall.obp)], ['slg', 'SLG', r3(batterOverall.slg)],
          ['whiffPct', 'WHIFF%', p1(batterOverall.whiffPct)], ['hardHitPct', 'HH%', p1(batterOverall.hardHitPct)], ['xwobaContact', 'xwOBA(Ct)', r3(batterOverall.xwobaContact)],
          ['hr', 'HR', i0(batterOverall.hr)], ['k', 'K', i0(batterOverall.k)], ['bb', 'BB', i0(batterOverall.bb)],
        ] as [keyof BatterStats, string, string][]).map(([key, label, value]) => {
          const col = BATTER_STAT_COLS.find(c => c.key === key)
          const heatStyle = col && !col.noHeat ? heat((batterOverall as any)[key], batPoolByCol[key], col.dir) : {}
          return (
            <div key={label} style={{ padding: '5px 9px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, minWidth: 56, ...heatStyle }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>{value}</div>
              <div style={{ fontSize: 8, color: 'var(--text-3)', marginTop: 2 }}>{label}</div>
            </div>
          )
        })}
      </div>

      {/* Batter's real results against each pitch type — full stat-column
          set, same as Slate Breakdown's own batter table. Click a row to
          drill into the batter's real zone breakdown on that exact pitch
          (same metric toggle) plus the batter's individual pitch log —
          plus the pitcher's own zone on that pitch too, when the current
          scope is actually about one specific arm rather than a pooled
          bullpen. */}
      <div style={{ overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <SortableTH label="Pitch" colKey="pitch" sort={batPitchSort} onSort={onSortBatPitch} align="left" />
              {BATTER_STAT_COLS.map(c => <SortableTH key={c.key} label={c.label} colKey={c.key} sort={batPitchSort} onSort={onSortBatPitch} />)}
            </tr>
          </thead>
          <tbody>
            {sortedBatPitchRows.length === 0 ? (
              <tr><td colSpan={BATTER_STAT_COLS.length + 1} style={{ padding: '8px', color: 'var(--text-3)', fontSize: 11 }}>No tracked pitches in this window.</td></tr>
            ) : sortedBatPitchRows.map(r => {
              const isOpen = expandedPitch === r.pitchType
              return (
                <Fragment key={r.pitchType}>
                  <tr
                    onClick={() => setExpandedPitch(isOpen ? null : r.pitchType)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isOpen ? 'var(--accent-dim)' : undefined }}
                  >
                    <td style={{ padding: '6px 8px', fontWeight: 700, color: isOpen ? 'var(--accent)' : 'var(--text-1)', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: pitchColor(r.pitchType), marginRight: 6, verticalAlign: 'middle' }} />
                      {pitchLabel(r.pitchType)}
                      <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--text-3)' }}>{isOpen ? '▲' : '▾'}</span>
                    </td>
                    {BATTER_STAT_COLS.map(c => {
                      const v = (r.batterStats as any)[c.key]
                      return (
                        <td key={c.key} style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', ...(c.noHeat ? {} : heat(v, batPoolByCol[c.key], c.dir)) }}>
                          {c.fmt(v)}
                        </td>
                      )
                    })}
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={BATTER_STAT_COLS.length + 1} style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.02)' }}>
                        {r.batterRowsForPitch.length === 0 ? (
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>No tracked pitches of this type in the current window.</div>
                        ) : (
                          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                            <div>
                              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
                                {ZONE_METRICS.map(m => <ToggleBtn key={m.key} active={zoneMetric === m.key} onClick={() => setZoneMetric(m.key)}>{m.label}</ToggleBtn>)}
                              </div>
                              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                                <div>
                                  <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.04em', marginBottom: 4 }}>{batterName}&apos;S ZONE</div>
                                  <ZoneGrid rows={r.batterRowsForPitch} metric={zoneMetric} dir={zoneMetricConfig.dir === 'hi' ? 'lo' : 'hi'} cellSize={44} />
                                </div>
                                {r.pitcherRowsForPitch.length > 0 && (
                                  <div>
                                    <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.04em', marginBottom: 4 }}>{pitcherName}&apos;S ZONE — THIS PITCH</div>
                                    <ZoneGrid rows={r.pitcherRowsForPitch} metric={zoneMetric} dir={zoneMetricConfig.dir} cellSize={44} />
                                  </div>
                                )}
                              </div>
                            </div>
                            <div style={{ flex: 1, minWidth: 320 }}>
                              <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.04em', marginBottom: 4 }}>
                                {r.batterRowsForPitch.length} INDIVIDUAL PITCH{r.batterRowsForPitch.length === 1 ? '' : 'ES'}
                              </div>
                              <PitchList rows={r.batterRowsForPitch} maxHeight={220} />
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
