'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import { pitchColor, pitchLabel, mlbHeadshot } from '@/lib/mlb-api'
import { getTeamLogoUrl } from '@/lib/mlbTeamColors'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
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

// "Vs This Team" needs a team's full pitcher roster (see Slate Breakdown's
// /api/slate/team-pitchers), which Dugout's own data pipeline doesn't carry
// a team_id for today — every other scope needs nothing beyond the two
// players' own pitch logs, so it's left out here rather than plumbing a new
// id through the whole Dugout fetch chain for one scope option.
const BATTER_MATCHUP_SCOPES = BATTER_SCOPES.filter(o => o.key !== 'vsTeam')

const r3 = (v: number | null) => (v == null ? '—' : v.toFixed(3).replace(/^0\./, '.').replace(/^-0\./, '-.'))
const p1 = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`)
const i0 = (v: number | null) => (v == null ? '—' : String(v))

type MixRow = {
  pitchType: string
  pitcherRowsForPitch: PitchLogRow[]
  batterRowsForPitch: PitchLogRow[]
  pitcherStats: BatterStats
  batterStats: BatterStats
}

// The real matchup panel: this pitcher's actual pitch-by-pitch log (real
// arsenal, recency-selectable, full stat-column set) next to this batter's
// actual pitch-by-pitch results against that same arsenal (recency-
// selectable independently, same full column set) — the same engine,
// column definitions, and recency-window concept Slate Breakdown's
// PitcherVsLineup uses (batterStatsEngine.ts), just condensed to the one
// matchup a Dugout row-expand actually needs instead of a whole lineup
// table. Replaces the old mlb-party 14-day/live-window pipeline, which only
// ever offered a fixed 14-day rolling window (or a capped ~20-pitch event
// popup) instead of a real, unbounded recency choice over genuine Statcast
// rows going back the full season.
export function MatchupPitchBreakdown({
  batterId, batterName, batterBats, pitcherId, pitcherName, pitcherHand, pitcherTeamAbbr,
}: {
  batterId: number
  batterName: string
  batterBats: string | null
  pitcherId: number
  pitcherName: string
  pitcherHand: 'R' | 'L'
  pitcherTeamAbbr: string
}) {
  const [pitcherRows, setPitcherRows] = useState<PitchLogRow[] | null>(null)
  const [batterRows, setBatterRows] = useState<PitchLogRow[] | null>(null)
  const [pitcherRecency, setPitcherRecency] = useState<typeof PITCHER_RECENCY[number]['key']>('season')
  const [batterScope, setBatterScope] = useState<typeof BATTER_MATCHUP_SCOPES[number]['key']>('season')
  const [zoneMetric, setZoneMetric] = useState<ZoneMetricKey>('run_value')
  const [pitSort, setPitSort] = useState<SortState>({ col: 'pitches', dir: 'desc' })
  const [batPitchSort, setBatPitchSort] = useState<SortState>({ col: 'pa', dir: 'desc' })
  const [expandedPitch, setExpandedPitch] = useState<string | null>(null)

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

  if (pitcherRows === null || batterRows === null) {
    return <div style={{ fontSize: 11, color: 'var(--text-3)', padding: '8px 0' }}>Loading real pitch-log matchup data…</div>
  }

  const pitcherWindowDates = pitcherRecency === 'season' ? null : lastNGameDates(pitcherRows, Number(pitcherRecency))
  const pitcherWindowRows = pitcherWindowDates ? pitcherRows.filter(r => pitcherWindowDates.has(r.game_date)) : pitcherRows
  const mix = pitchMix(pitcherWindowRows)
  const mixSet = new Set(mix.map(m => m.pitchType))

  // Recency is resolved against the batter's REAL games-played calendar
  // (all his rows), same lesson as Slate Breakdown — "his last 5 games"
  // means 5 real games, not 5 games that happened to include this arsenal.
  const batterWindowDates = batterScope === 'season' || batterScope === 'vsPitcher' ? null : lastNGameDates(batterRows, Number(batterScope))
  const batterScopedRows = batterRows.filter(r => {
    if (batterScope === 'vsPitcher' && r.pitcher_id !== pitcherId) return false
    if (batterWindowDates && !batterWindowDates.has(r.game_date)) return false
    return true
  })
  const batterVsMixRows = batterScopedRows.filter(r => r.pitch_type && mixSet.has(r.pitch_type))
  const batterOverall = computeStatLine(batterVsMixRows)

  const mixRows: MixRow[] = mix.map(m => {
    const pitcherRowsForPitch = pitcherWindowRows.filter(r => r.pitch_type === m.pitchType)
    const batterRowsForPitch = batterScopedRows.filter(r => r.pitch_type === m.pitchType)
    return {
      pitchType: m.pitchType,
      pitcherRowsForPitch,
      batterRowsForPitch,
      pitcherStats: { ...computeStatLine(pitcherRowsForPitch), usage: m.usage },
      // Real share of this batter's own tracked pitches (against this
      // arsenal, in the current scope) that were this specific pitch type —
      // the batter-side analogue of the pitcher's own Usage %, not a stand-in.
      batterStats: { ...computeStatLine(batterRowsForPitch), usage: batterVsMixRows.length > 0 ? (batterRowsForPitch.length / batterVsMixRows.length) * 100 : null },
    }
  })

  const onSortPit = (col: string) => setPitSort(prev => toggleSortState(prev, col))
  const activePitSort = pitSort ?? { col: 'pitches', dir: 'desc' as const }
  const sortedPitRows = [...mixRows].sort((a, b) => {
    if (activePitSort.col === 'pitch') return cmpAny(pitchLabel(a.pitchType), pitchLabel(b.pitchType), activePitSort.dir)
    return cmpNullsLast((a.pitcherStats as any)[activePitSort.col], (b.pitcherStats as any)[activePitSort.col], activePitSort.dir)
  })
  const pitPoolByCol = Object.fromEntries(PITCHER_STAT_COLS.map(c => [c.key, mixRows.map(r => (r.pitcherStats as any)[c.key])]))

  const onSortBatPitch = (col: string) => setBatPitchSort(prev => toggleSortState(prev, col))
  const activeBatPitchSort = batPitchSort ?? { col: 'pa', dir: 'desc' as const }
  const sortedBatPitchRows = [...mixRows].sort((a, b) => {
    if (activeBatPitchSort.col === 'pitch') return cmpAny(pitchLabel(a.pitchType), pitchLabel(b.pitchType), activeBatPitchSort.dir)
    return cmpNullsLast((a.batterStats as any)[activeBatPitchSort.col], (b.batterStats as any)[activeBatPitchSort.col], activeBatPitchSort.dir)
  })
  const batPoolByCol = Object.fromEntries(BATTER_STAT_COLS.map(c => [c.key, mixRows.map(r => (r.batterStats as any)[c.key])]))

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
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
          {PITCHER_RECENCY.map(o => <ToggleBtn key={o.key} active={pitcherRecency === o.key} onClick={() => setPitcherRecency(o.key)}>{o.label}</ToggleBtn>)}
        </div>
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
            ) : sortedPitRows.map(r => (
              <tr key={r.pitchType} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 8px', fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: pitchColor(r.pitchType), marginRight: 6, verticalAlign: 'middle' }} />
                  {pitchLabel(r.pitchType)}
                </td>
                {PITCHER_STAT_COLS.map(c => {
                  const v = (r.pitcherStats as any)[c.key]
                  return (
                    <td key={c.key} style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', ...(c.noHeat ? {} : heat(v, pitPoolByCol[c.key], c.dir)) }}>
                      {c.fmt(v)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em' }}>
          {batterName.toUpperCase()} VS THIS ARSENAL
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
          {BATTER_MATCHUP_SCOPES.map(o => <ToggleBtn key={o.key} active={batterScope === o.key} onClick={() => setBatterScope(o.key)}>{o.label}</ToggleBtn>)}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
        {([
          ['PA', i0(batterOverall.pa)], ['AVG', r3(batterOverall.avg)], ['OBP', r3(batterOverall.obp)], ['SLG', r3(batterOverall.slg)],
          ['WHIFF%', p1(batterOverall.whiffPct)], ['HH%', p1(batterOverall.hardHitPct)], ['xwOBA(Ct)', r3(batterOverall.xwobaContact)],
          ['HR', i0(batterOverall.hr)], ['K', i0(batterOverall.k)], ['BB', i0(batterOverall.bb)],
        ] as [string, string][]).map(([label, value]) => (
          <div key={label} style={{ padding: '5px 9px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, minWidth: 56 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>{value}</div>
            <div style={{ fontSize: 8, color: 'var(--text-3)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Batter's real results against each pitch type — full stat-column
          set, same as Slate Breakdown's own batter table. Click a row to
          drill into both players' real zone breakdown on that exact pitch
          (same metric toggle) plus the batter's individual pitch log. */}
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
                        {r.batterRowsForPitch.length === 0 && r.pitcherRowsForPitch.length === 0 ? (
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
                                <div>
                                  <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.04em', marginBottom: 4 }}>{pitcherName}&apos;S ZONE — THIS PITCH</div>
                                  <ZoneGrid rows={r.pitcherRowsForPitch} metric={zoneMetric} dir={zoneMetricConfig.dir} cellSize={44} />
                                </div>
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
