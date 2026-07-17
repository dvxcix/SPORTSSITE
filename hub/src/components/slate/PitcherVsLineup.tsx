'use client'

import { useEffect, useState } from 'react'
import { pitchLabel } from '@/lib/mlb-api'
import { heat, SortableTH, SortState, toggleSortState, cmpAny, cmpNullsLast } from '@/components/pitcher-report/MatchupTables'
import { HandBadge, PlayerLink, StatGrid, cardStyle, sectionTitleStyle, windowTag, ToggleBtn } from '@/components/players/PlayerPageClient'
import { ZoneGrid, ChaseZoneStats, ZONE_METRICS, type ZoneMetricKey } from '@/components/players/ZoneGrid'
import { computeStatLine, lastNGameDates, pitchMix, BATTER_STAT_COLS, r3, d1, p1, i0, type PitchLogRow } from '@/lib/batterStatsEngine'
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

// The core matchup unit: one probable starter's recency-selectable stat
// line + pitch mix + zone profile, and every batter he's facing today,
// each recomputed against exactly the pitch types that starter actually
// throws — not "this batter vs this pitcher" history, "this batter vs
// pitches like the ones he'll see today."
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

  function batterRowsForScope(batterId: number): PitchLogRow[] {
    const rows = batterRowsById[batterId] ?? []
    const pitchFiltered = rows.filter(r => r.pitch_type && mixSet.has(r.pitch_type))
    if (batterScope === 'season') return pitchFiltered
    if (batterScope === 'vsPitcher') return pitchFiltered.filter(r => r.pitcher_id === pitcher.id)
    if (batterScope === 'vsTeam') return teamPitcherIds ? pitchFiltered.filter(r => teamPitcherIds.has(r.pitcher_id)) : []
    // Recency resolved against the batter's REAL games-played calendar (all
    // his rows), not the already pitch-filtered subset — "his last 5 games"
    // means 5 real games, not 5 games that happened to include this mix.
    const dates = lastNGameDates(rows, Number(batterScope))
    return pitchFiltered.filter(r => dates.has(r.game_date))
  }

  const batterRows = opposingLineup.map(b => ({
    player: b,
    stats: computeStatLine(batterRowsForScope(b.mlb_id)),
    loaded: b.mlb_id in batterRowsById,
  }))

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

        <div style={{ marginBottom: 16 }}>
          <StatGrid pairs={[
            ['Pitches', i0(pitcherStats.pitches)], ['Games', String(pitcherStats.games)],
            ['BF', i0(pitcherStats.pa)], ['AVG Allowed', r3(pitcherStats.avg)], ['SLG Allowed', r3(pitcherStats.slg)],
            ['Whiff %', p1(pitcherStats.whiffPct)], ['Hard-Hit % Allowed', p1(pitcherStats.hardHitPct)],
            ['xwOBA Allowed', r3(pitcherStats.xwobaContact)], ['RV/100', d1(pitcherStats.runValuePer100)],
          ]} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.04em', marginBottom: 8 }}>
          PITCH MIX — {mix.length} pitch{mix.length === 1 ? '' : 'es'} tracked
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
          {mix.map(m => (
            <span key={m.pitchType} style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, border: '1px solid var(--border)', color: 'var(--text-2)' }}>
              {pitchLabel(m.pitchType)} · {m.usage.toFixed(0)}%
            </span>
          ))}
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
          <span style={windowTag}>vs {pitcher.name}&apos;s pitch mix</span>
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
              {sortedBatters.map(({ player, stats, loaded }) => (
                <BatterRow
                  key={player.mlb_id}
                  player={player}
                  stats={stats}
                  loaded={loaded}
                  allByCol={allByCol}
                  expanded={expandedBatterId === player.mlb_id}
                  onToggle={() => setExpandedBatterId(v => v === player.mlb_id ? null : player.mlb_id)}
                  zoneRows={(batterRowsById[player.mlb_id] ?? []).filter(r => r.pitch_type && mixSet.has(r.pitch_type))}
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

// zoneDir is pre-flipped by the caller: the pitcher's own zone grid colors
// green-for-pitcher, but a batter's own zone breakdown (shown on row expand)
// should color green-for-the-batter instead — same metric, opposite "good"
// direction, since these are two different players' outcomes in that zone.
function BatterRow({ player, stats, loaded, allByCol, expanded, onToggle, zoneRows, zoneMetric, zoneDir }: {
  player: LineupPlayer; stats: ReturnType<typeof computeStatLine>; loaded: boolean
  allByCol: Record<string, (number | null)[]>
  expanded: boolean; onToggle: () => void
  zoneRows: PitchLogRow[]; zoneMetric: ZoneMetricKey; zoneDir: 'hi' | 'lo'
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
            {zoneRows.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>No tracked pitches from this pitcher&apos;s mix in the current window.</div>
            ) : (
              <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <ZoneGrid rows={zoneRows} metric={zoneMetric} dir={zoneDir} cellSize={44} />
                <div style={{ fontSize: 11, color: 'var(--text-3)', maxWidth: 240 }}>{player.name}&apos;s own zone tendencies, filtered to this pitcher&apos;s pitch mix and the current scope.</div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
