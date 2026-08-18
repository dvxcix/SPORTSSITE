'use client'

import Link from 'next/link'
import { useEffect, useState, type CSSProperties } from 'react'
import { Activity, BarChart3, Crosshair, Layers3, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { mlbHeadshot, pitchColor, pitchLabel } from '@slipsurge/core/mlb-api'
import { getTeamColor, getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import { SortableTH, type SortState, toggleSortState, cmpAny, cmpNullsLast } from '@/components/pitcher-report/MatchupTables'
import { HandBadge } from '@/components/players/PlayerPageClient'
import { PlayerAvatar, TeamLogo } from '@/components/sports/PlayerAvatar'
import { ZoneGrid, ChaseZoneStats, ZONE_METRICS, type ZoneMetricKey } from '@/components/players/ZoneGrid'
import { PitchList } from '@/components/players/PitchList'
import {
  computeStatLine,
  lastNGameDates,
  pitchMix,
  BATTER_STAT_COLS,
  PITCHER_STAT_COLS,
  MIN_PITCHES_FOR_HEAT,
  type PitchLogRow,
} from '@slipsurge/core/batterStatsEngine'
import type { LineupPlayer, ProbablePitcher, TeamPitcher } from '@slipsurge/core/mlbSchedule'
import { BATTER_SCOPES, PITCHER_RECENCY } from './PitcherVsLineup'
import styles from './MatchupExperience.module.css'

type StatLine = ReturnType<typeof computeStatLine>
type RecencyKey = typeof PITCHER_RECENCY[number]['key']
type BatterScopeKey = typeof BATTER_SCOPES[number]['key']

const OUTCOME_COUNTS = new Set<keyof StatLine>(['hits', 'singles', 'doubles', 'triples', 'hr', 'bb', 'k'])
const VOLUME_KEYS = new Set<keyof StatLine>(['pitches', 'usage', 'pa'])

function heatValue(stats: StatLine, key: keyof StatLine): number | null {
  const raw = stats[key]
  if (typeof raw !== 'number') return null
  if (OUTCOME_COUNTS.has(key)) return stats.pa > 0 ? raw / stats.pa : null
  return raw
}

function sampleHeat(value: number | null, all: (number | null)[]): CSSProperties {
  if (value == null) return {}
  const valid = all.filter((item): item is number => item != null && Number.isFinite(item))
  if (valid.length < 2) return {}
  const min = Math.min(...valid)
  const max = Math.max(...valid)
  const position = max === min ? 0.5 : (value - min) / (max - min)
  return {
    background: `rgba(57, 205, 255, ${(0.035 + position * 0.14).toFixed(3)})`,
    color: position > 0.7 ? '#73dcff' : 'var(--text-1)',
  }
}

function signalHeat(value: number | null, all: (number | null)[], dir: 'hi' | 'lo'): CSSProperties {
  if (value == null) return {}
  const valid = all.filter((item): item is number => item != null && Number.isFinite(item))
  if (valid.length < 3) return {}
  const min = Math.min(...valid)
  const max = Math.max(...valid)
  if (max === min) return { background: 'rgba(57, 205, 255, 0.025)' }

  let position = (value - min) / (max - min)
  if (dir === 'lo') position = 1 - position

  if (position > 0.66) {
    const strength = (position - 0.66) / 0.34
    return {
      background: `rgba(180, 255, 77, ${(0.035 + strength * 0.145).toFixed(3)})`,
      boxShadow: strength > 0.72 ? 'inset 0 0 0 1px rgba(180, 255, 77, 0.16)' : undefined,
      color: strength > 0.82 ? 'var(--accent)' : 'var(--text-1)',
    }
  }
  if (position < 0.33) {
    const strength = (0.33 - position) / 0.33
    return {
      background: `rgba(255, 77, 106, ${(0.04 + strength * 0.16).toFixed(3)})`,
      boxShadow: strength > 0.72 ? 'inset 0 0 0 1px rgba(255, 77, 106, 0.17)' : undefined,
      color: 'var(--text-1)',
    }
  }
  return { background: 'rgba(57, 205, 255, 0.025)' }
}

function relativeCellHeat(stats: StatLine, key: keyof StatLine, pool: (number | null)[], dir: 'hi' | 'lo'): CSSProperties {
  const value = heatValue(stats, key)
  return VOLUME_KEYS.has(key) ? sampleHeat(value, pool) : signalHeat(value, pool, dir)
}

function mixLabel(pitchTypes: Set<string>): string {
  return Array.from(pitchTypes).map(pitchType => pitchLabel(pitchType)).join(', ')
}

function formatDecimal(value: number | null, digits = 3): string {
  return value == null ? '-' : value.toFixed(digits)
}

function PlayerNameLink({ id, name }: { id: number; name: string }) {
  return <Link className={styles.playerNameLink} href={`/players/${id}`}>{name}</Link>
}

export function PitcherVsLineup({
  pitcher,
  pitcherTeamAbbr,
  pitcherTeamId,
  opposingLineup,
  opposingTeamAbbr,
  opposingTeamName,
  lineupConfirmed,
}: {
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
  const [pitcherRecency, setPitcherRecency] = useState<RecencyKey>('season')
  const [batterScope, setBatterScope] = useState<BatterScopeKey>('season')
  const [zoneMetric, setZoneMetric] = useState<ZoneMetricKey>('run_value')
  const [sort, setSort] = useState<SortState>({ col: 'pa', dir: 'desc' })
  const [pitchSort, setPitchSort] = useState<SortState>({ col: 'pitches', dir: 'desc' })
  const [pinnedPitches, setPinnedPitches] = useState<Set<string>>(new Set())
  const [expandedBatterId, setExpandedBatterId] = useState<number | null>(null)

  const lineupIdKey = opposingLineup.map(batter => batter.mlb_id).join(',')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/players/${pitcher.id}/pitch-log`)
      .then(response => response.json())
      .then(data => { if (!cancelled) setPitcherRows(data.pitcherRows ?? []) })
      .catch(() => { if (!cancelled) setPitcherRows([]) })
    return () => { cancelled = true }
  }, [pitcher.id])

  useEffect(() => {
    let cancelled = false
    Promise.all(opposingLineup.map(batter =>
      fetch(`/api/players/${batter.mlb_id}/pitch-log`)
        .then(response => response.json())
        .then(data => ({ id: batter.mlb_id, rows: (data.batterRows ?? []) as PitchLogRow[] }))
        .catch(() => ({ id: batter.mlb_id, rows: [] as PitchLogRow[] })),
    )).then(results => {
      if (!cancelled) setBatterRowsById(Object.fromEntries(results.map(result => [result.id, result.rows])))
    })
    return () => { cancelled = true }
    // The joined key intentionally reloads only when the actual lineup changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineupIdKey])

  useEffect(() => {
    if (batterScope !== 'vsTeam' || teamPitcherIds || !pitcherTeamId) return
    fetch(`/api/slate/team-pitchers?teamId=${pitcherTeamId}`)
      .then(response => response.json())
      .then(data => setTeamPitcherIds(new Set((data.pitchers ?? []).map((item: TeamPitcher) => item.id))))
      .catch(() => setTeamPitcherIds(new Set()))
  }, [batterScope, pitcherTeamId, teamPitcherIds])

  if (pitcherRows === null) {
    return <div className={styles.emptyMatchup}>Loading {pitcher.name}&apos;s matchup workspace.</div>
  }

  const pitcherWindowDates = pitcherRecency === 'season' ? null : lastNGameDates(pitcherRows, Number(pitcherRecency))
  const pitcherWindowRows = pitcherWindowDates ? pitcherRows.filter(row => pitcherWindowDates.has(row.game_date)) : pitcherRows
  const pitcherStats = computeStatLine(pitcherWindowRows)
  const mix = pitchMix(pitcherWindowRows)
  const mixSet = new Set(mix.map(item => item.pitchType))
  const effectiveMixSet = pinnedPitches.size > 0 ? pinnedPitches : mixSet
  const zoneMetricConfig = ZONE_METRICS.find(metric => metric.key === zoneMetric) ?? ZONE_METRICS[0]
  const pitcherTeamColor = getTeamColor(pitcherTeamAbbr)
  const opponentColor = getTeamColor(opposingTeamAbbr)

  function togglePin(pitchType: string) {
    setPinnedPitches(previous => {
      const next = new Set(previous)
      if (next.has(pitchType)) next.delete(pitchType)
      else next.add(pitchType)
      return next
    })
  }

  const mixRows = mix.map(item => ({
    pitchType: item.pitchType,
    ...computeStatLine(pitcherWindowRows.filter(row => row.pitch_type === item.pitchType)),
    usage: item.usage,
  }))
  const activePitchSort = pitchSort ?? { col: 'pitches', dir: 'desc' as const }
  const sortedMixRows = [...mixRows].sort((a, b) => {
    if (activePitchSort.col === 'pitchType') return cmpAny(pitchLabel(a.pitchType), pitchLabel(b.pitchType), activePitchSort.dir)
    const aValue = a[activePitchSort.col as keyof typeof a]
    const bValue = b[activePitchSort.col as keyof typeof b]
    return cmpNullsLast(
      typeof aValue === 'number' ? aValue : null,
      typeof bValue === 'number' ? bValue : null,
      activePitchSort.dir,
    )
  })
  const mixByCol = Object.fromEntries(PITCHER_STAT_COLS.map(column => [
    column.key,
    mixRows.filter(row => row.pitches >= MIN_PITCHES_FOR_HEAT).map(row => heatValue(row, column.key)),
  ])) as Record<string, (number | null)[]>

  function batterRowsForScope(batterId: number): PitchLogRow[] {
    const rows = batterRowsById[batterId] ?? []
    const pitchFiltered = rows.filter(row => row.pitch_type && effectiveMixSet.has(row.pitch_type))
    if (batterScope === 'season') return pitchFiltered
    if (batterScope === 'vsPitcher') return pitchFiltered.filter(row => row.pitcher_id === pitcher.id)
    if (batterScope === 'vsTeam') return teamPitcherIds ? pitchFiltered.filter(row => teamPitcherIds.has(row.pitcher_id)) : []
    const dates = lastNGameDates(rows, Number(batterScope))
    return pitchFiltered.filter(row => dates.has(row.game_date))
  }

  const batterRows = opposingLineup.map(player => {
    const filtered = batterRowsForScope(player.mlb_id)
    return { player, filtered, stats: computeStatLine(filtered), loaded: player.mlb_id in batterRowsById }
  })
  const activeSort = sort ?? { col: 'pa', dir: 'desc' as const }
  const sortedBatters = [...batterRows].sort((a, b) => {
    if (activeSort.col === 'name') return cmpAny(a.player.name, b.player.name, activeSort.dir)
    return cmpNullsLast(a.stats[activeSort.col as keyof StatLine], b.stats[activeSort.col as keyof StatLine], activeSort.dir)
  })
  const allByCol = Object.fromEntries(BATTER_STAT_COLS.map(column => [
    column.key,
    batterRows.filter(row => row.stats.pitches >= MIN_PITCHES_FOR_HEAT).map(row => heatValue(row.stats, column.key)),
  ])) as Record<string, (number | null)[]>
  const combinedBatterRows = batterRows.flatMap(row => row.filtered)
  const selectedBatter = expandedBatterId == null
    ? null
    : batterRows.find(row => row.player.mlb_id === expandedBatterId) ?? null
  const responseRows = selectedBatter?.filtered ?? combinedBatterRows

  const summary = [
    ['Pitches', String(pitcherStats.pitches), true],
    ['Games', String(pitcherStats.games), false],
    ['Batters', String(pitcherStats.pa), false],
    ['AVG', formatDecimal(pitcherStats.avg), false],
    ['SLG', formatDecimal(pitcherStats.slg), false],
    ['Whiff', pitcherStats.whiffPct == null ? '-' : `${pitcherStats.whiffPct.toFixed(1)}%`, true],
    ['Hard hit', pitcherStats.hardHitPct == null ? '-' : `${pitcherStats.hardHitPct.toFixed(1)}%`, false],
    ['xwOBA', formatDecimal(pitcherStats.xwobaContact), false],
    ['RV / 100', pitcherStats.runValuePer100 == null ? '-' : pitcherStats.runValuePer100.toFixed(1), false],
  ] as const

  return (
    <div className={styles.report} style={{ '--pitcher-team': pitcherTeamColor, '--opponent-team': opponentColor } as CSSProperties}>
      <section className={styles.matchupHero}>
        <div className={styles.heroPitcher}>
          <PlayerAvatar headshot={mlbHeadshot(pitcher.id)} teamLogo={getTeamLogoUrl(pitcherTeamAbbr)} teamAbbr={pitcherTeamAbbr} name={pitcher.name} size={64} />
          <div>
            <span className={styles.eyebrow}>{pitcherTeamAbbr} starter intelligence</span>
            <PlayerNameLink id={pitcher.id} name={pitcher.name} />
            <p><HandBadge hand={pitcher.hand} /> {pitcher.hand}HP · pitch-by-pitch profile</p>
          </div>
        </div>
        <div className={styles.heroVersus}><Crosshair size={22} /><span>ATTACKS</span></div>
        <div className={styles.heroOpponent}>
          <div>
            <span className={styles.eyebrow}>Today&apos;s opponent</span>
            <strong>{opposingTeamName}</strong>
            <p><span data-confirmed={lineupConfirmed}>{lineupConfirmed ? 'Confirmed lineup' : 'Projected lineup'}</span></p>
          </div>
          <TeamLogo logo={getTeamLogoUrl(opposingTeamAbbr)} name={opposingTeamName} size={58} />
        </div>
      </section>

      <section className={styles.analysisCard}>
        <header className={styles.sectionHeader}>
          <div><Activity size={16} /><span><small>STARTER SAMPLE</small><strong>Pitch profile and results allowed</strong></span></div>
          <nav className={styles.windowControl} aria-label="Pitcher sample window">
            {PITCHER_RECENCY.map(option => <button key={option.key} type="button" data-active={pitcherRecency === option.key} onClick={() => setPitcherRecency(option.key)}>{option.label}</button>)}
          </nav>
        </header>

        <div className={styles.summaryGrid}>
          {summary.map(([label, value, primary]) => <div key={label} data-primary={primary}><small>{label}</small><strong>{value}</strong></div>)}
        </div>

        <div className={styles.subsectionHeader}>
          <div><Layers3 size={15} /><span><strong>Pitch mix</strong><small>Select one or more pitches to filter every batter below.</small></span></div>
          {pinnedPitches.size > 0 && <button type="button" onClick={() => setPinnedPitches(new Set())}><RotateCcw size={13} /> Reset {mixLabel(pinnedPitches)}</button>}
        </div>
        <div className={styles.heatLegend} aria-label="Heatmap legend">
          <b>Relative heat</b><span><i data-tone="strong" />Strong</span><span><i data-tone="neutral" />Neutral</span><span><i data-tone="weak" />Weak</span>
          <small>Counts stay exact. H, 1B, 2B, 3B, HR, BB and K color by rate per PA.</small>
        </div>
        <div className={styles.dataTableShell}>
          <table className={styles.dataTable}>
            <thead><tr>
              <SortableTH label="Pitch" colKey="pitchType" sort={pitchSort} onSort={column => setPitchSort(previous => toggleSortState(previous, column))} align="left" />
              {PITCHER_STAT_COLS.map(column => <SortableTH key={column.key} label={column.label} colKey={column.key} sort={pitchSort} onSort={key => setPitchSort(previous => toggleSortState(previous, key))} />)}
            </tr></thead>
            <tbody>
              {sortedMixRows.map(row => {
                const isPinned = pinnedPitches.has(row.pitchType)
                return (
                  <tr key={row.pitchType} data-pinned={isPinned} onClick={() => togglePin(row.pitchType)} style={{ '--pitch-color': pitchColor(row.pitchType) } as CSSProperties}>
                    <td><span className={styles.pitchIdentity}><i /><span><strong>{pitchLabel(row.pitchType)}</strong><small>{row.pitchType}</small></span></span></td>
                    {PITCHER_STAT_COLS.map(column => {
                      const style = row.pitches < MIN_PITCHES_FOR_HEAT && !column.noHeat ? {} : relativeCellHeat(row, column.key, mixByCol[column.key], column.dir)
                      return <td key={column.key} style={style}>{column.fmt(row[column.key])}</td>
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className={`${styles.subsectionHeader} ${styles.zoneHeader}`}>
          <div><Crosshair size={15} /><span><strong>Zone matchup</strong><small>{selectedBatter ? `${selectedBatter.player.name}'s response against this pitcher and active mix.` : `Pitcher command beside the full ${opposingTeamAbbr} lineup response. Select a batter below to isolate them.`}</small></span></div>
          <div className={styles.metricControl}>
            <span>Color by</span>
            {ZONE_METRICS.map(metric => <button key={metric.key} type="button" data-active={zoneMetric === metric.key} onClick={() => setZoneMetric(metric.key)}>{metric.label}</button>)}
          </div>
        </div>
        <div className={styles.zoneComparison}>
          <article className={styles.zoneCard} style={{ '--identity-color': pitcherTeamColor } as CSSProperties}>
            <header><div className={styles.zoneIdentity}><PlayerAvatar headshot={mlbHeadshot(pitcher.id)} teamLogo={getTeamLogoUrl(pitcherTeamAbbr)} teamAbbr={pitcherTeamAbbr} name={pitcher.name} size={34} /><span><small>PITCHER ZONE</small><strong>{pitcher.name}</strong></span></div></header>
            <div className={styles.zoneContent}><ZoneGrid rows={pitcherWindowRows} metric={zoneMetric} dir={zoneMetricConfig.dir} cellSize={58} /><ChaseZoneStats rows={pitcherWindowRows} /></div>
          </article>
          <article className={styles.zoneCard} data-focused={Boolean(selectedBatter)} style={{ '--identity-color': opponentColor } as CSSProperties}>
            <header>
              <div className={styles.zoneIdentity}>
                {selectedBatter
                  ? <PlayerAvatar headshot={mlbHeadshot(selectedBatter.player.mlb_id)} teamLogo={getTeamLogoUrl(selectedBatter.player.team)} teamAbbr={selectedBatter.player.team} name={selectedBatter.player.name} size={34} />
                  : <TeamLogo logo={getTeamLogoUrl(opposingTeamAbbr)} name={opposingTeamName} size={34} />}
                <span><small>{selectedBatter ? 'BATTER RESPONSE' : 'LINEUP RESPONSE'}</small><strong>{selectedBatter ? `${selectedBatter.player.name} vs ${pitcher.name}` : `${opposingTeamAbbr} vs ${pitcher.name}`}</strong></span>
              </div>
              {selectedBatter && <button className={styles.zoneReset} type="button" onClick={() => setExpandedBatterId(null)}><RotateCcw size={12} /> Team view</button>}
            </header>
            <div className={styles.zoneContent}><ZoneGrid rows={responseRows} metric={zoneMetric} dir={zoneMetricConfig.dir === 'hi' ? 'lo' : 'hi'} cellSize={58} /><ChaseZoneStats rows={responseRows} /></div>
          </article>
        </div>
      </section>

      <section className={styles.analysisCard}>
        <header className={styles.lineupHeader}>
          <div className={styles.lineupIdentity}>
            <TeamLogo logo={getTeamLogoUrl(opposingTeamAbbr)} name={opposingTeamName} size={43} />
            <span><small>{lineupConfirmed ? 'CONFIRMED LINEUP' : 'PROJECTED LINEUP'}</small><strong>{opposingTeamName} batters</strong></span>
          </div>
          <div className={styles.vsPitcherCard}>
            <span>VS</span>
            <PlayerAvatar headshot={mlbHeadshot(pitcher.id)} teamLogo={getTeamLogoUrl(pitcherTeamAbbr)} teamAbbr={pitcherTeamAbbr} name={pitcher.name} size={31} />
            <div><strong>{pinnedPitches.size > 0 ? mixLabel(pinnedPitches) : `${pitcher.name}'s mix`}</strong><small>{pinnedPitches.size > 0 ? 'Pinned pitch filter' : 'Complete pitch arsenal'}</small></div>
          </div>
        </header>
        <div className={styles.scopeBar}>
          <div><SlidersHorizontal size={13} /> Batter sample</div>
          <nav aria-label="Batter sample window">
            {BATTER_SCOPES.map(option => <button key={option.key} type="button" data-active={batterScope === option.key} onClick={() => setBatterScope(option.key)}>{option.label}</button>)}
          </nav>
        </div>
        <div className={styles.heatLegend}>
          <b>Lineup heat</b><span><i data-tone="strong" />Advantage</span><span><i data-tone="neutral" />Even</span><span><i data-tone="weak" />Concern</span>
          <small>Select a batter row to compare that player against the pitcher above. Every cell is relative to this lineup and sample.</small>
        </div>
        <div className={styles.dataTableShell}>
          <table className={`${styles.dataTable} ${styles.batterTable}`}>
            <thead><tr>
              <SortableTH label="Batter" colKey="name" sort={sort} onSort={column => setSort(previous => toggleSortState(previous, column))} align="left" />
              {BATTER_STAT_COLS.map(column => <SortableTH key={column.key} label={column.label} colKey={column.key} sort={sort} onSort={key => setSort(previous => toggleSortState(previous, key))} />)}
            </tr></thead>
            <tbody>
              {sortedBatters.map(row => (
                <BatterRow
                  key={row.player.mlb_id}
                  player={row.player}
                  stats={row.stats}
                  loaded={row.loaded}
                  allByCol={allByCol}
                  expanded={expandedBatterId === row.player.mlb_id}
                  onToggle={() => setExpandedBatterId(current => current === row.player.mlb_id ? null : row.player.mlb_id)}
                  filteredRows={row.filtered}
                  zoneMetric={zoneMetric}
                  zoneDir={zoneMetricConfig.dir === 'hi' ? 'lo' : 'hi'}
                />
              ))}
              {sortedBatters.length === 0 && <tr><td colSpan={BATTER_STAT_COLS.length + 1} className={styles.emptyDetail}>No lineup posted for {opposingTeamAbbr} yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function BatterRow({ player, stats, loaded, allByCol, expanded, onToggle, filteredRows, zoneMetric, zoneDir }: {
  player: LineupPlayer
  stats: StatLine
  loaded: boolean
  allByCol: Record<string, (number | null)[]>
  expanded: boolean
  onToggle: () => void
  filteredRows: PitchLogRow[]
  zoneMetric: ZoneMetricKey
  zoneDir: 'hi' | 'lo'
}) {
  return (
    <>
      <tr data-expanded={expanded} onClick={onToggle} style={{ opacity: loaded ? 1 : 0.68 }}>
        <td>
          <div className={styles.batterIdentity}>
            <span className={styles.expandMark}>{expanded ? '−' : '+'}</span>
            <span className={styles.order}>{player.batting_order}</span>
            <PlayerAvatar headshot={mlbHeadshot(player.mlb_id)} teamLogo={getTeamLogoUrl(player.team)} teamAbbr={player.team} name={player.name} size={30} />
            <PlayerNameLink id={player.mlb_id} name={player.name} />
            <HandBadge hand={player.bats} />
          </div>
        </td>
        {BATTER_STAT_COLS.map(column => {
          const style = !loaded || (stats.pitches < MIN_PITCHES_FOR_HEAT && !column.noHeat) ? {} : relativeCellHeat(stats, column.key, allByCol[column.key], column.dir)
          return <td key={column.key} style={style}>{loaded ? column.fmt(stats[column.key]) : '·'}</td>
        })}
      </tr>
      {expanded && (
        <tr className={styles.expandedRow}>
          <td colSpan={BATTER_STAT_COLS.length + 1}>
            {filteredRows.length === 0 ? (
              <div className={styles.emptyDetail}>No tracked pitches in the current pitch-mix and sample filters.</div>
            ) : (
              <div className={styles.batterDetail}>
                <div className={styles.batterZone}><div><Crosshair size={13} /> BATTER RESPONSE ZONE</div><ZoneGrid rows={filteredRows} metric={zoneMetric} dir={zoneDir} cellSize={44} /></div>
                <div className={styles.pitchLogDetail}><div><BarChart3 size={13} /> {filteredRows.length} INDIVIDUAL PITCH{filteredRows.length === 1 ? '' : 'ES'}</div><PitchList rows={filteredRows} /></div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
