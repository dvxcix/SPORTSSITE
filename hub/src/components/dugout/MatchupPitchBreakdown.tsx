'use client'

import { Fragment, useEffect, useState } from 'react'
import { pitchColor, pitchLabel } from '@/lib/mlb-api'
import { heat, SortableTH, type SortState, toggleSortState, cmpNullsLast, cmpAny } from '@/components/pitcher-report/MatchupTables'
import { ZoneGrid, ZONE_METRICS, type ZoneMetricKey } from '@/components/players/ZoneGrid'
import { PitchList } from '@/components/players/PitchList'
import { ToggleBtn } from '@/components/players/PlayerPageClient'
import { computeStatLine, lastNGameDates, pitchMix, type PitchLogRow } from '@/lib/batterStatsEngine'
import { PITCHER_RECENCY, BATTER_SCOPES } from '@/components/slate/PitcherVsLineup'

// Real per-pitch data is player-scoped (thousands of rows for a full-time
// player), not per-matchup — the same starter's log is needed by every
// batter he's facing tonight, and the same batter's log is needed however
// many times his row gets expanded. One shared in-memory cache per mlb_id
// keeps re-expanding a row (or two batters facing the same starter) from
// re-fetching identical data. Deliberately module-scope, not React state —
// it just needs to outlive individual component instances for the page
// session, not survive a reload.
const pitchLogCache = new Map<number, Promise<{ pitcherRows: PitchLogRow[]; batterRows: PitchLogRow[] }>>()
function fetchPitchLogCached(mlbId: number) {
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

// The real matchup panel: this pitcher's actual pitch-by-pitch log (real
// arsenal, recency-selectable) next to this batter's actual pitch-by-pitch
// results against that same arsenal (recency-selectable independently) —
// the same engine and recency-window concept Slate Breakdown's
// PitcherVsLineup uses (batterStatsEngine.ts), just condensed to the one
// matchup a Dugout row-expand actually needs instead of a whole lineup
// table. Replaces the old mlb-party 14-day/live-window pipeline, which only
// ever offered a fixed 14-day rolling window (or a capped ~20-pitch event
// popup) instead of a real, unbounded recency choice over genuine Statcast
// rows going back the full season.
export function MatchupPitchBreakdown({
  batterId, batterName, batterBats, pitcherId, pitcherName, pitcherHand, opposingTeamName, lineupConfirmed,
}: {
  batterId: number
  batterName: string
  batterBats: string | null
  pitcherId: number
  pitcherName: string
  pitcherHand: 'R' | 'L'
  opposingTeamName: string
  lineupConfirmed: boolean
}) {
  const [pitcherRows, setPitcherRows] = useState<PitchLogRow[] | null>(null)
  const [batterRows, setBatterRows] = useState<PitchLogRow[] | null>(null)
  const [pitcherRecency, setPitcherRecency] = useState<typeof PITCHER_RECENCY[number]['key']>('season')
  const [batterScope, setBatterScope] = useState<typeof BATTER_MATCHUP_SCOPES[number]['key']>('season')
  const [zoneMetric, setZoneMetric] = useState<ZoneMetricKey>('run_value')
  const [mixSort, setMixSort] = useState<SortState>({ col: 'pitches', dir: 'desc' })
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

  const mixRows = mix.map(m => {
    const batterRowsForPitch = batterScopedRows.filter(r => r.pitch_type === m.pitchType)
    return {
      pitchType: m.pitchType,
      usage: m.usage,
      pitcherStats: computeStatLine(pitcherWindowRows.filter(r => r.pitch_type === m.pitchType)),
      batterStats: computeStatLine(batterRowsForPitch),
      batterRowsForPitch,
    }
  })

  const onSortMix = (col: string) => setMixSort(prev => toggleSortState(prev, col))
  const activeMixSort = mixSort ?? { col: 'pitches', dir: 'desc' as const }
  const sortedMixRows = [...mixRows].sort((a, b) => {
    switch (activeMixSort.col) {
      case 'pitch': return cmpAny(pitchLabel(a.pitchType), pitchLabel(b.pitchType), activeMixSort.dir)
      case 'usage': return cmpNullsLast(a.usage, b.usage, activeMixSort.dir)
      case 'pit_whiff': return cmpNullsLast(a.pitcherStats.whiffPct, b.pitcherStats.whiffPct, activeMixSort.dir)
      case 'pit_hh': return cmpNullsLast(a.pitcherStats.hardHitPct, b.pitcherStats.hardHitPct, activeMixSort.dir)
      case 'bat_pa': return cmpNullsLast(a.batterStats.pa, b.batterStats.pa, activeMixSort.dir)
      case 'bat_avg': return cmpNullsLast(a.batterStats.avg, b.batterStats.avg, activeMixSort.dir)
      case 'bat_whiff': return cmpNullsLast(a.batterStats.whiffPct, b.batterStats.whiffPct, activeMixSort.dir)
      case 'bat_hh': return cmpNullsLast(a.batterStats.hardHitPct, b.batterStats.hardHitPct, activeMixSort.dir)
      default: return cmpNullsLast(a.pitcherStats.pitches, b.pitcherStats.pitches, activeMixSort.dir)
    }
  })
  const pitWhiffPool = mixRows.map(r => r.pitcherStats.whiffPct)
  const pitHhPool = mixRows.map(r => r.pitcherStats.hardHitPct)
  const batAvgPool = mixRows.map(r => r.batterStats.avg)
  const batWhiffPool = mixRows.map(r => r.batterStats.whiffPct)
  const batHhPool = mixRows.map(r => r.batterStats.hardHitPct)

  const zoneMetricConfig = ZONE_METRICS.find(m => m.key === zoneMetric)!
  const totalPitches = mixRows.reduce((a, r) => a + r.pitcherStats.pitches, 0)

  return (
    <div style={{ minWidth: 460, flex: '1 1 520px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em' }}>
          REAL PITCH-LOG MATCHUP · vs {pitcherHand}HP
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
          {PITCHER_RECENCY.map(o => <ToggleBtn key={o.key} active={pitcherRecency === o.key} onClick={() => setPitcherRecency(o.key)}>{o.label}</ToggleBtn>)}
        </div>
      </div>
      <div style={{ fontSize: 8, color: 'var(--text-4)', marginBottom: 6 }}>
        Real Statcast pitch-by-pitch data, not a pre-aggregated window — {pitcherName}&apos;s actual arsenal ({totalPitches} pitches tracked) next to {batterName}&apos;s own results against each pitch. Click a row for the individual pitches.
      </div>

      <div style={{ overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 12 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-3)', fontWeight: 700, whiteSpace: 'nowrap' }}>PITCH</th>
              <SortableTH label="MIX%" colKey="usage" sort={mixSort} onSort={onSortMix} />
              <SortableTH label="PIT·WHIFF%" colKey="pit_whiff" sort={mixSort} onSort={onSortMix} />
              <SortableTH label="PIT·HH%" colKey="pit_hh" sort={mixSort} onSort={onSortMix} />
              <SortableTH label="BAT·PA" colKey="bat_pa" sort={mixSort} onSort={onSortMix} />
              <SortableTH label="BAT·AVG" colKey="bat_avg" sort={mixSort} onSort={onSortMix} />
              <SortableTH label="BAT·WHIFF%" colKey="bat_whiff" sort={mixSort} onSort={onSortMix} />
              <SortableTH label="BAT·HH%" colKey="bat_hh" sort={mixSort} onSort={onSortMix} />
            </tr>
          </thead>
          <tbody>
            {sortedMixRows.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '8px', color: 'var(--text-3)', fontSize: 11 }}>No tracked pitches in this window.</td></tr>
            ) : sortedMixRows.map(r => {
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
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', fontWeight: 700 }}>{r.usage.toFixed(0)}%</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', ...heat(r.pitcherStats.whiffPct, pitWhiffPool, 'hi') }}>{p1(r.pitcherStats.whiffPct)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', ...heat(r.pitcherStats.hardHitPct, pitHhPool, 'lo') }}>{p1(r.pitcherStats.hardHitPct)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-2)' }}>{i0(r.batterStats.pa)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', ...heat(r.batterStats.avg, batAvgPool, 'hi') }}>{r3(r.batterStats.avg)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', ...heat(r.batterStats.whiffPct, batWhiffPool, 'lo') }}>{p1(r.batterStats.whiffPct)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', ...heat(r.batterStats.hardHitPct, batHhPool, 'hi') }}>{p1(r.batterStats.hardHitPct)}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={8} style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.02)' }}>
                        {r.batterRowsForPitch.length === 0 ? (
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{batterName} has no tracked pitches of this type in the current window.</div>
                        ) : (
                          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                            <div>
                              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
                                {ZONE_METRICS.map(m => <ToggleBtn key={m.key} active={zoneMetric === m.key} onClick={() => setZoneMetric(m.key)}>{m.label}</ToggleBtn>)}
                              </div>
                              <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.04em', marginBottom: 4 }}>{batterName}&apos;S ZONE</div>
                              <ZoneGrid rows={r.batterRowsForPitch} metric={zoneMetric} dir={zoneMetricConfig.dir === 'hi' ? 'lo' : 'hi'} cellSize={44} />
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em' }}>
          {batterName.toUpperCase()} VS THIS ARSENAL
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
          {BATTER_MATCHUP_SCOPES.map(o => <ToggleBtn key={o.key} active={batterScope === o.key} onClick={() => setBatterScope(o.key)}>{o.label}</ToggleBtn>)}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
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
      <p style={{ fontSize: 8, color: 'var(--text-4)', marginTop: 6 }}>
        {batterScope === 'vsPitcher'
          ? `Every real plate appearance ${batterName} has had against ${pitcherName} specifically.`
          : batterScope === 'season'
          ? `${batterName}'s full season against ${pitcherName}'s current arsenal.`
          : `${batterName}'s real last ${batterScope} game${batterScope === '1' ? '' : 's'} against ${pitcherName}'s current arsenal.`}
        {' · '}{lineupConfirmed ? 'Confirmed lineup' : `Projected lineup vs ${opposingTeamName}`}
      </p>
    </div>
  )
}
