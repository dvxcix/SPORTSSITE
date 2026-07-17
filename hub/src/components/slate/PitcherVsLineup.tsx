'use client'

import { useEffect, useState } from 'react'
import { pitchLabel } from '@/lib/mlb-api'
import { heat, SortableTH, SortState, toggleSortState, cmpAny, cmpNullsLast } from '@/components/pitcher-report/MatchupTables'
import { HandBadge, PlayerLink, StatGrid, cardStyle, sectionTitleStyle, windowTag, ToggleBtn } from '@/components/players/PlayerPageClient'
import { ZoneGrid, ChaseZoneStats, ZONE_METRICS, type ZoneMetricKey } from '@/components/players/ZoneGrid'
import { PitchList } from '@/components/players/PitchList'
import { computeStatLine, lastNGameDates, pitchMix, BATTER_STAT_COLS, PITCHER_STAT_COLS, type PitchLogRow } from '@/lib/batterStatsEngine'
import type { LineupPlayer, ProbablePitcher, TeamPitcher } from '@/lib/mlbSchedule'

const PITCHER_RECENCY = [
  { key: 'season', label: 'Season' },
  { key: '10', label: 'Last 10 Starts' },
  { key: '5', label: 'Last 5 Starts' },
  { key: '3', label: 'Last 3 Starts' },
] as const

const BATTER_SCOPES = [
  { key: 'season', label: 'Season' },
  { key: '1', label: 'Last Game' },
  { key: '3', label: 'Last 3 Games' },
  { key: '5', label: 'Last 5 Games' },
  { key: '10', label: 'Last 10 Games' },
  { key: 'vsPitcher', label: 'Vs. This Pitcher' },
  { key: 'vsTeam', label: 'Vs. This Team' },
] as const

function PitchTypeCell({ pitchType }: { pitchType: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
      {pitchLabel(pitchType)}
    </span>
  )
}

// The core matchup unit: one probable starter's recency-selectable stat
// line + pitch mix (sortable/heat-mapped, pinnable — click a pitch row to
// drill the batter table down to just that pitch) + zone profile, and
// every batter he's facing today, each recomputed against exactly the
// pitch types that starter actually throws.
export function PitcherVsLineup({ pitcher, pitcherTeamAbbr, pitcherTeamId, opposingLineup, opposingTeamAbbr, opposingTeamName, lineupConfirmed }: {
  pitcher: ProbablePitcher
  pitcherTeamAbbr: string
  pitcherTeamId: number | null
  opposingLineup: LineupPlayer[]
  opposingTeamAbbr: string
  opposingTeamName: string
  lineupConfirmed: boolean
}) {
  const [pitcherRows, setPitcherRows] = useState<PitchLogRow[] | null>(null)
  const [batterRowsById, setBatterRowsById] = useState<Record<number, PitchLogRow[]>>({})
  const [teamPitcherIds, setTeamPitcherIds] = useState<Set<number> | null>(null)
  const [pitcherRecency, setPitcherRecency] = useState<typeof PITCHER_RECENCY[number]['key']>('season')
  const [batterScope, setBatterScope] = useState<typeof BATTER_SCOPES[number]['key']>('season')
  const [zoneMetric, setZoneMetric] = useState<ZoneMetricKey>('run_value')
  const [sort, setSort] = useState<SortState>({ col: 'pa', dir: 'desc' })
  const [pitchSort, setPitchSort] = useState<SortState>({ col: 'pitches', dir: 'desc' })
  const [pinnedPitches, setPinnedPitches] = useState<Set<string>>(new Set())
  const [expandedBatterId, setExpandedBatterId] = useState<number | null>(null)

  const lineupIdKey = opposingLineup.map(b => b.mlb_id).join(',')

  useEffect(() => {
    let cancelled = false
    setPitcherRows(null)
    fetch(`/api/players/${pitcher.id}/pitch-log`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setPitcherRows(d.pitcherRows ?? []) })
      .catch(() => { if (!cancelled) setPitcherRows([]) })
    return () => { cancelled = true }
  }, [pitcher.id])

  useEffect(() => {
    let cancelled = false
    setBatterRowsById({})
    Promise.all(opposingLineup.map(b =>
      fetch(`/api/players/${b.mlb_id}/pitch-log`)
        .then(r => r.json())
        .then(d => ({ id: b.mlb_id, rows: (d.batterRows ?? []) as PitchLogRow[] }))
        .catch(() => ({ id: b.mlb_id, rows: [] as PitchLogRow[] }))
    )).then(results => {
      if (cancelled) return
      setBatterRowsById(Object.fromEntries(results.map(r => [r.id, r.rows])))
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineupIdKey])

  // Team-wide pitcher roster only fetched once the "vs team" scope actually
  // gets used — every other scope needs nothing from this endpoint.
  useEffect(() => {
    if (batterScope !== 'vsTeam' || teamPitcherIds || !pitcherTeamId) return
    fetch(`/api/slate/team-pitchers?teamId=${pitcherTeamId}`)
      .then(r => r.json())
      .then(d => setTeamPitcherIds(new Set((d.pitchers ?? []).map((p: TeamPitcher) => p.id))))
      .catch(() => setTeamPitcherIds(new Set()))
  }, [batterScope, pitcherTeamId, teamPitcherIds])

  if (pitcherRows === null) {
    return <div style={{ color: 'var(--text-3)', fontSize: 13, padding: 24 }}>Loading {pitcher.name}&apos;s pitch log…</div>
  }

  const pitcherWindowDates = pitcherRecency === 'season' ? null : lastNGameDates(pitcherRows, Number(pitcherRecency))
  const pitcherWindowRows = pitcherWindowDates ? pitcherRows.filter(r => pitcherWindowDates.has(r.game_date)) : pitcherRows
  const pitcherStats = computeStatLine(pitcherWindowRows)
  const mix = pitchMix(pitcherWindowRows)
  const mixSet = new Set(mix.map(m => m.pitchType))
  const zoneMetricConfig = ZONE_METRICS.find(m => m.key === zoneMetric)!

  // Pinning a pitch (or several) in the mix table below drills the whole
  // batter table down to just those pitch types instead of the starter's
  // full mix — same idea as Pitcher Report's pin-a-pitch cross-reference,
  // just driving this page's own batter table instead of a side panel.
  const effectiveMixSet = pinnedPitches.size > 0 ? pinnedPitches : mixSet
  function togglePin(pt: string) {
    setPinnedPitches(prev => {
      const next = new Set(prev)
      if (next.has(pt)) next.delete(pt); else next.add(pt)
      return next
    })
  }

  const mixRows = mix.map(m => ({ pitchType: m.pitchType, ...computeStatLine(pitcherWindowRows.filter(r => r.pitch_type === m.pitchType)), usage: m.usage }))
  const onPitchSort = (col: string) => setPitchSort(prev => toggleSortState(prev, col))
  const activePitchSort = pitchSort ?? { col: 'pitches', dir: 'desc' as const }
  const sortedMixRows = [...mixRows].sort((a, b) => {
    if (activePitchSort.col === 'pitchType') return cmpAny(pitchLabel(a.pitchType), pitchLabel(b.pitchType), activePitchSort.dir)
    return cmpNullsLast((a as any)[activePitchSort.col], (b as any)[activePitchSort.col], activePitchSort.dir)
  })
  const mixByCol = Object.fromEntries(PITCHER_STAT_COLS.map(c => [c.key, mixRows.map(r => (r as any)[c.key])]))

  function batterRowsForScope(batterId: number): PitchLogRow[] {
    const rows = batterRowsById[batterId] ?? []
    const pitchFiltered = rows.filter(r => r.pitch_type && effectiveMixSet.has(r.pitch_type))
    if (batterScope === 'season') return pitchFiltered
    if (batterScope === 'vsPitcher') return pitchFiltered.filter(r => r.pitcher_id === pitcher.id)
    if (batterScope === 'vsTeam') return teamPitcherIds ? pitchFiltered.filter(r => teamPitcherIds.has(r.pitcher_id)) : []
    // Recency resolved against the batter's REAL games-played calendar (all
    // his rows), not the already pitch-filtered subset — "his last 5 games"
    // means 5 real games, not 5 games that happened to include this mix.
    const dates = lastNGameDates(rows, Number(batterScope))
    return pitchFiltered.filter(r => dates.has(r.game_date))
  }

  const batterRows = opposingLineup.map(b => {
    const filtered = batterRowsForScope(b.mlb_id)
    return { player: b, filtered, stats: computeStatLine(filtered), loaded: b.mlb_id in batterRowsById }
  })

  const onSort = (col: string) => setSort(prev => toggleSortState(prev, col))
  const activeSort = sort ?? { col: 'pa', dir: 'desc' as const }
  const sortedBatters = [...batterRows].sort((a, b) => {
    if (activeSort.col === 'name') return cmpAny(a.player.name, b.player.name, activeSort.dir)
    return cmpNullsLast((a.stats as any)[activeSort.col], (b.stats as any)[activeSort.col], activeSort.dir)
  })
  const allByCol = Object.fromEntries(BATTER_STAT_COLS.map(c => [c.key, batterRows.map(r => r.stats[c.key])]))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={cardStyle}>
        <div style={sectionTitleStyle}>
          <PlayerLink mlbId={pitcher.id} name={pitcher.name} teamAbbr={pitcherTeamAbbr} size={28} />
          <HandBadge hand={pitcher.hand} />
          <span style={windowTag}>vs {opposingTeamName}{lineupConfirmed ? '' : ' · Projected lineup'}</span>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
          {PITCHER_RECENCY.map(o => <ToggleBtn key={o.key} active={pitcherRecency === o.key} onClick={() => setPitcherRecency(o.key)}>{o.label}</ToggleBtn>)}
        </div>

        <div style={{ marginBottom: 20 }}>
          <StatGrid pairs={[
            ['Pitches', String(pitcherStats.pitches)], ['Games', String(pitcherStats.games)],
            ['BF', String(pitcherStats.pa)], ['AVG Allowed', pitcherStats.avg == null ? '—' : pitcherStats.avg.toFixed(3)],
            ['SLG Allowed', pitcherStats.slg == null ? '—' : pitcherStats.slg.toFixed(3)],
            ['Whiff %', pitcherStats.whiffPct == null ? '—' : `${pitcherStats.whiffPct.toFixed(1)}%`],
            ['Hard-Hit % Allowed', pitcherStats.hardHitPct == null ? '—' : `${pitcherStats.hardHitPct.toFixed(1)}%`],
            ['xwOBA Allowed', pitcherStats.xwobaContact == null ? '—' : pitcherStats.xwobaContact.toFixed(3)],
            ['RV/100', pitcherStats.runValuePer100 == null ? '—' : pitcherStats.runValuePer100.toFixed(1)],
          ]} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.04em' }}>
            PITCH MIX — {mix.length} pitch{mix.length === 1 ? '' : 'es'} tracked
          </span>
          {pinnedPitches.size > 0 && (
            <span
              onClick={() => setPinnedPitches(new Set())}
              style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}
            >
              BATTERS FILTERED TO {mixLabel(pinnedPitches)} — CLEAR
            </span>
          )}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 8 }}>Click a pitch row to pin it — the batter table below drills down to just that pitch (or pitches).</div>
        <div style={{ overflowX: 'auto', marginBottom: 20 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <SortableTH label="Pitch" colKey="pitchType" sort={pitchSort} onSort={onPitchSort} align="left" />
                {PITCHER_STAT_COLS.map(c => <SortableTH key={c.key} label={c.label} colKey={c.key} sort={pitchSort} onSort={onPitchSort} />)}
              </tr>
            </thead>
            <tbody>
              {sortedMixRows.map(row => {
                const isPinned = pinnedPitches.has(row.pitchType)
                return (
                  <tr
                    key={row.pitchType}
                    onClick={() => togglePin(row.pitchType)}
                    style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: isPinned ? 'var(--accent-dim)' : undefined }}
                  >
                    <td style={{ padding: '6px 8px', fontWeight: 700, color: isPinned ? 'var(--accent)' : 'var(--text-1)' }}>
                      <PitchTypeCell pitchType={row.pitchType} />
                    </td>
                    {PITCHER_STAT_COLS.map(c => {
                      const v = (row as any)[c.key]
                      return (
                        <td key={c.key} style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', ...(c.noHeat ? {} : heat(v as number | null, mixByCol[c.key], c.dir)) }}>
                          {c.fmt(v)}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Zone color by:</span>
          {ZONE_METRICS.map(m => <ToggleBtn key={m.key} active={zoneMetric === m.key} onClick={() => setZoneMetric(m.key)}>{m.label}</ToggleBtn>)}
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <ZoneGrid rows={pitcherWindowRows} metric={zoneMetric} dir={zoneMetricConfig.dir} />
          <ChaseZoneStats rows={pitcherWindowRows} />
        </div>
      </div>

      <div style={cardStyle}>
        <div style={sectionTitleStyle}>
          {opposingTeamName} Batters
          <span style={windowTag}>vs {pinnedPitches.size > 0 ? `${mixLabel(pinnedPitches)} only` : `${pitcher.name}'s pitch mix`}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {BATTER_SCOPES.map(o => <ToggleBtn key={o.key} active={batterScope === o.key} onClick={() => setBatterScope(o.key)}>{o.label}</ToggleBtn>)}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <SortableTH label="Batter" colKey="name" sort={sort} onSort={onSort} align="left" />
                {BATTER_STAT_COLS.map(c => <SortableTH key={c.key} label={c.label} colKey={c.key} sort={sort} onSort={onSort} />)}
              </tr>
            </thead>
            <tbody>
              {sortedBatters.map(({ player, filtered, stats, loaded }) => (
                <BatterRow
                  key={player.mlb_id}
                  player={player}
                  stats={stats}
                  loaded={loaded}
                  allByCol={allByCol}
                  expanded={expandedBatterId === player.mlb_id}
                  onToggle={() => setExpandedBatterId(v => v === player.mlb_id ? null : player.mlb_id)}
                  filteredRows={filtered}
                  zoneMetric={zoneMetric}
                  zoneDir={zoneMetricConfig.dir === 'hi' ? 'lo' : 'hi'}
                />
              ))}
              {sortedBatters.length === 0 && (
                <tr><td colSpan={BATTER_STAT_COLS.length + 1} style={{ padding: '12px 8px', color: 'var(--text-3)', textAlign: 'center' }}>No lineup posted for {opposingTeamAbbr} yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function mixLabel(pitchTypes: Set<string>): string {
  return Array.from(pitchTypes).map(pt => pitchLabel(pt)).join(', ')
}

// zoneDir is pre-flipped by the caller: the pitcher's own zone grid colors
// green-for-pitcher, but a batter's own zone breakdown (shown on row expand)
// should color green-for-the-batter instead — same metric, opposite "good"
// direction, since these are two different players' outcomes in that zone.
function BatterRow({ player, stats, loaded, allByCol, expanded, onToggle, filteredRows, zoneMetric, zoneDir }: {
  player: LineupPlayer; stats: ReturnType<typeof computeStatLine>; loaded: boolean
  allByCol: Record<string, (number | null)[]>
  expanded: boolean; onToggle: () => void
  filteredRows: PitchLogRow[]; zoneMetric: ZoneMetricKey; zoneDir: 'hi' | 'lo'
}) {
  return (
    <>
      <tr style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', opacity: loaded ? 1 : 0.5 }} onClick={onToggle}>
        <td style={{ padding: '6px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, color: 'var(--text-3)', width: 14, flexShrink: 0 }}>{expanded ? '▾' : '▸'}</span>
            <span style={{ fontSize: 9, color: 'var(--text-3)', width: 12, flexShrink: 0 }}>{player.batting_order}</span>
            <HandBadge hand={player.bats} />
            <PlayerLink mlbId={player.mlb_id} name={player.name} teamAbbr={player.team} size={22} />
          </div>
        </td>
        {BATTER_STAT_COLS.map(c => {
          const v = stats[c.key]
          return (
            <td key={c.key} style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', ...(c.noHeat || !loaded ? {} : heat(v as number | null, allByCol[c.key], c.dir)) }}>
              {loaded ? c.fmt(v) : '…'}
            </td>
          )
        })}
      </tr>
      {expanded && (
        <tr>
          <td colSpan={BATTER_STAT_COLS.length + 1} style={{ padding: '10px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
            {filteredRows.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>No tracked pitches in the current pitch-mix/scope filter.</div>
            ) : (
              <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.04em', marginBottom: 6 }}>ZONE</div>
                  <ZoneGrid rows={filteredRows} metric={zoneMetric} dir={zoneDir} cellSize={44} />
                </div>
                <div style={{ flex: 1, minWidth: 320 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.04em', marginBottom: 6 }}>
                    {filteredRows.length} INDIVIDUAL PITCH{filteredRows.length === 1 ? '' : 'ES'}
                  </div>
                  <PitchList rows={filteredRows} />
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
