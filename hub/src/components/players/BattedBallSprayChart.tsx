'use client'

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import Image from 'next/image'
import { Crosshair, Flame, Layers3, Play, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { ParkFieldSvg } from '@/components/sports/ParkFieldSvg'
import { MLB_PARKS } from '@slipsurge/core/mlbParks'
import { pitchLabel } from '@slipsurge/core/mlb-api'
import { mlbTeamAbbrById } from '@slipsurge/core/mlbTeams'
import { getTeamColor, getTeamLogoUrl, getTeamSecondaryColor } from '@slipsurge/core/mlbTeamColors'
import { formatBattedBallDistance, resolveBattedBallDistance } from '@slipsurge/core/battedBallDistance'
import styles from './BattedBallSprayChart.module.css'

export type SprayPitchRow = {
  game_pk: string
  game_date: string
  pitcher_id: number
  opponent_name?: string | null
  opponent_team?: string | null
  pitch_type?: string | null
  p_throws?: string | null
  events?: string | null
  is_in_play: boolean
  is_home_run: boolean
  launch_speed?: number | null
  launch_angle?: number | null
  hit_distance?: number | null
  hc_x?: number | null
  hc_y?: number | null
  bb_type?: string | null
  inning?: number | null
  at_bat_index?: number | null
  pitch_number?: number | null
  venue_id?: number | null
  venue_name?: string | null
  home_team_id?: number | null
  home_team?: string | null
  away_team?: string | null
  parks_hr_count?: number | null
  park_hr_list?: string | null
  is_near_hr?: boolean
}

export type SprayProjection = {
  teamAbbr: string
  parkName: string
  venueId?: number | null
  contextLabel?: string
}

type WindowKey = 'season' | '10' | '5' | '3' | '1'
type ResultKey = 'all' | 'home_run' | 'near_hr' | 'hits' | 'outs'
type ViewKey = 'points' | 'heat'

const SPECIAL_VENUES = new Set([5340, 5355, 5445])

function canonicalAbbr(abbr?: string | null) {
  if (!abbr) return 'MLB'
  const upper = abbr.toUpperCase()
  return ({ AZ: 'ARI', OAK: 'ATH', CHW: 'CWS', KCR: 'KC', SDP: 'SD', SFG: 'SF', TBR: 'TB', WSN: 'WSH' } as Record<string, string>)[upper] ?? upper
}

function rowPark(row: SprayPitchRow) {
  const venueId = Number(row.venue_id ?? 0)
  const homeAbbr = canonicalAbbr(mlbTeamAbbrById(Number(row.home_team_id)))
  const hasExactOutline = !SPECIAL_VENUES.has(venueId) && Boolean(MLB_PARKS[homeAbbr])
  return {
    key: `${venueId || 'unknown'}:${row.venue_name ?? homeAbbr}`,
    venueId,
    name: row.venue_name ?? MLB_PARKS[homeAbbr]?.name ?? 'Unknown venue',
    teamAbbr: hasExactOutline ? homeAbbr : 'MLB',
    displayAbbr: homeAbbr,
    exact: hasExactOutline,
  }
}

function eventLabel(event?: string | null) {
  const labels: Record<string, string> = {
    home_run: 'Home run', single: 'Single', double: 'Double', triple: 'Triple',
    field_out: 'Field out', force_out: 'Force out', groundout: 'Groundout',
    sac_fly: 'Sacrifice fly', field_error: 'Reached on error', fielders_choice: "Fielder's choice",
    double_play: 'Double play', grounded_into_double_play: 'Grounded into double play',
  }
  return labels[event ?? ''] ?? (event ? event.replaceAll('_', ' ') : 'Ball in play')
}

function resultKind(row: SprayPitchRow): Exclude<ResultKey, 'all'> {
  if (row.is_home_run || row.events === 'home_run') return 'home_run'
  if (row.is_near_hr) return 'near_hr'
  if (['single', 'double', 'triple'].includes(row.events ?? '')) return 'hits'
  return 'outs'
}

function resultColor(row: SprayPitchRow) {
  const kind = resultKind(row)
  if (kind === 'home_run') return '#a3ff3f'
  if (kind === 'near_hr') return '#ff9f43'
  if (row.events === 'triple') return '#d78cff'
  if (row.events === 'double') return '#49a8ff'
  if (row.events === 'single') return '#30e6d0'
  return '#a6b0c4'
}

function fmt(value: number | null | undefined, suffix = '') {
  return typeof value === 'number' && Number.isFinite(value) ? `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}` : 'Not tracked'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`))
}

type BattedBallSprayChartProps = {
  rows: SprayPitchRow[]
  playerName: string
  projection?: SprayProjection
  compact?: boolean
  fieldOverlay?: ReactNode
}

export function BattedBallSprayChart({ rows, playerName, projection, compact = false, fieldOverlay }: BattedBallSprayChartProps) {
  const eligible = useMemo(() => rows.filter(row => row.is_in_play && Number.isFinite(Number(row.hc_x)) && Number.isFinite(Number(row.hc_y))), [rows])
  const parks = useMemo(() => {
    const grouped = new Map<string, ReturnType<typeof rowPark> & { count: number; latest: string }>()
    for (const row of eligible) {
      const park = rowPark(row)
      const current = grouped.get(park.key)
      if (current) {
        current.count += 1
        if (row.game_date > current.latest) current.latest = row.game_date
      } else grouped.set(park.key, { ...park, count: 1, latest: row.game_date })
    }
    return Array.from(grouped.values()).sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest))
  }, [eligible])

  const [parkKey, setParkKey] = useState('')
  const [windowKey, setWindowKey] = useState<WindowKey>('season')
  const [resultKey, setResultKey] = useState<ResultKey>('all')
  const [throwHand, setThrowHand] = useState('all')
  const [pitchType, setPitchType] = useState('all')
  const [view, setView] = useState<ViewKey>('points')
  const [selectedKey, setSelectedKey] = useState('')
  const [replay, setReplay] = useState(0)

  const projectedAbbr = canonicalAbbr(projection?.teamAbbr)
  const projectedExact = Boolean(projection && MLB_PARKS[projectedAbbr])
  const currentPark = projection ? {
    key: `projection:${projection.venueId ?? projectedAbbr}`,
    venueId: Number(projection.venueId ?? 0),
    name: projection.parkName,
    teamAbbr: projectedExact ? projectedAbbr : 'MLB',
    displayAbbr: projectedAbbr,
    exact: projectedExact,
  } : (parks.find(park => park.key === parkKey) ?? parks[0])

  const parkRows = useMemo(
    () => projection ? eligible : eligible.filter(row => rowPark(row).key === currentPark?.key),
    [currentPark?.key, eligible, projection],
  )
  const gameKeys = useMemo(() => Array.from(new Set(parkRows
    .slice()
    .sort((a, b) => b.game_date.localeCompare(a.game_date) || Number(b.game_pk) - Number(a.game_pk))
    .map(row => row.game_pk))), [parkRows])
  const allowedGames = useMemo(() => new Set(projection || windowKey === 'season' ? gameKeys : gameKeys.slice(0, Number(windowKey))), [gameKeys, projection, windowKey])
  const pitchTypes = useMemo(() => Array.from(new Set(parkRows.map(row => row.pitch_type).filter((value): value is string => Boolean(value)))).sort(), [parkRows])
  const visibleRows = useMemo(() => parkRows.filter(row => {
    if (!allowedGames.has(row.game_pk)) return false
    if (resultKey !== 'all' && resultKind(row) !== resultKey) return false
    if (!projection && throwHand !== 'all' && row.p_throws !== throwHand) return false
    if (!projection && pitchType !== 'all' && row.pitch_type !== pitchType) return false
    return true
  }), [allowedGames, parkRows, pitchType, projection, resultKey, throwHand])

  const keyFor = (row: SprayPitchRow) => `${row.game_pk}:${row.at_bat_index ?? 0}:${row.pitch_number ?? 0}`
  const selected = visibleRows.find(row => keyFor(row) === selectedKey)
    ?? visibleRows.find(row => row.is_home_run)
    ?? visibleRows.find(row => row.is_near_hr)
    ?? visibleRows[0]

  if (!eligible.length || !currentPark) return null

  const primary = currentPark.exact ? getTeamColor(currentPark.teamAbbr) : '#263149'
  const secondary = currentPark.exact ? getTeamSecondaryColor(currentPark.teamAbbr) : '#91a0ba'
  const logo = currentPark.exact ? getTeamLogoUrl(currentPark.teamAbbr) : undefined
  const totals = visibleRows.reduce((acc, row) => {
    acc.bbe += 1
    if (row.is_home_run) acc.hr += 1
    if (row.is_near_hr) acc.near += 1
    if (Number(row.launch_speed) >= 95) acc.hard += 1
    return acc
  }, { bbe: 0, hr: 0, near: 0, hard: 0 })
  const compactClass = compact ? styles.compact : ''

  return (
    <section className={`${styles.card} ${compactClass}`} aria-labelledby="spray-title">
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <span className={styles.icon}><Crosshair size={20} /></span>
          <div>
            <p className={styles.eyebrow}>{projection ? "Today's park projection" : 'Park-specific contact map'}</p>
            <h2 id="spray-title">{projection ? 'Selected Contact Overlay' : 'Batted Ball Spray'}</h2>
            <p>{projection ? projection.contextLabel : 'Every marker uses the official venue, Statcast landing coordinate, and scored result.'}</p>
          </div>
        </div>
        <div className={styles.summary}>
          <span><strong>{totals.bbe}</strong> BBE</span>
          <span><strong>{totals.hr}</strong> HR</span>
          <span><strong>{totals.bbe ? Math.round((totals.hard / totals.bbe) * 100) : 0}%</strong> hard hit</span>
        </div>
      </header>

      <div className={styles.toolbar}>
        {!projection && <label className={styles.selectWrap}>
          <span>Ballpark</span>
          <select value={currentPark.key} onChange={event => setParkKey(event.target.value)}>
            {parks.map(park => <option key={park.key} value={park.key}>{park.name} · {park.count}</option>)}
          </select>
        </label>}
        {!projection && <div className={styles.segment} aria-label="Game window">
          {(['season', '10', '5', '3', '1'] as WindowKey[]).map(value => (
            <button key={value} type="button" className={windowKey === value ? styles.active : ''} onClick={() => setWindowKey(value)}>
              {value === 'season' ? 'Season' : `L${value}`}
            </button>
          ))}
        </div>}
        <div className={styles.segment} aria-label="Chart style">
          <button type="button" className={view === 'points' ? styles.active : ''} onClick={() => setView('points')}><Crosshair size={14} /> Points</button>
          <button type="button" className={view === 'heat' ? styles.active : ''} onClick={() => setView('heat')}><Flame size={14} /> Heat</button>
        </div>
      </div>

      <div className={styles.filters}>
        <span className={styles.filterLabel}><SlidersHorizontal size={14} /> Result</span>
        {(['all', 'home_run', 'near_hr', 'hits', 'outs'] as ResultKey[]).map(value => (
          <button key={value} type="button" className={resultKey === value ? styles.filterActive : ''} onClick={() => setResultKey(value)}>
            {{ all: 'All', home_run: 'HR', near_hr: 'Near HR', hits: 'Hits', outs: 'Outs' }[value]}
          </button>
        ))}
        {!projection && <>
          <select aria-label="Pitcher hand" value={throwHand} onChange={event => setThrowHand(event.target.value)}>
            <option value="all">Any pitcher hand</option><option value="R">vs RHP</option><option value="L">vs LHP</option>
          </select>
          <select aria-label="Pitch type" value={pitchType} onChange={event => setPitchType(event.target.value)}>
            <option value="all">Any pitch</option>
            {pitchTypes.map(value => <option key={value} value={value}>{pitchLabel(value)}</option>)}
          </select>
          <button type="button" className={styles.reset} onClick={() => { setWindowKey('season'); setResultKey('all'); setThrowHand('all'); setPitchType('all') }}><RotateCcw size={13} /> Reset</button>
        </>}
      </div>

      <div className={styles.workspace}>
        <div className={styles.stage}>
          <div className={styles.parkLabel}>
            {logo && <Image src={logo} alt="" width={27} height={27} />}
            <span><strong>{currentPark.name}</strong>{projection ? projection.contextLabel : (currentPark.exact ? 'Traced park geometry' : 'Neutral-site outline unavailable')}</span>
          </div>
          {logo && <Image className={styles.watermark} src={logo} alt="" width={150} height={150} />}
          <ParkFieldSvg
            primary={primary}
            secondary={secondary}
            teamAbbr={currentPark.teamAbbr}
            className={styles.field}
            ariaLabel={`${playerName} batted-ball spray projected at ${currentPark.name}`}
          >
            <defs>
              <filter id={`spray-glow-${currentPark.venueId}`} x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id={`spray-heat-${currentPark.venueId}`} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="7" /></filter>
            </defs>
            {visibleRows.map((row, index) => {
              const rowKey = keyFor(row)
              const isSelected = selected && rowKey === keyFor(selected)
              const color = resultColor(row)
              const ev = Number(row.launch_speed ?? 86)
              const radius = Math.max(2.1, Math.min(4.2, 2.1 + (ev - 80) / 14))
              return (
                <g
                  key={rowKey}
                  className={`${styles.point} ${view === 'heat' ? styles.heatPoint : ''} ${isSelected ? styles.selectedPoint : ''}`}
                  style={{ '--point-delay': `${Math.min(index, 80) * 12}ms` } as CSSProperties}
                  role="button"
                  tabIndex={0}
                  aria-label={`${eventLabel(row.events)} on ${formatDate(row.game_date)}. ${fmt(row.launch_speed, ' mph')}, ${formatBattedBallDistance(row, { unavailable: 'distance not tracked' })}.`}
                  onMouseEnter={() => { setSelectedKey(rowKey); setReplay(value => value + 1) }}
                  onFocus={() => setSelectedKey(rowKey)}
                  onClick={() => { setSelectedKey(rowKey); setReplay(value => value + 1) }}
                  onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedKey(rowKey); setReplay(value => value + 1) } }}
                >
                  {view === 'heat' && <circle cx={Number(row.hc_x)} cy={Number(row.hc_y)} r={13} fill={color} opacity={0.32} filter={`url(#spray-heat-${currentPark.venueId})`} />}
                  {row.is_near_hr && !row.is_home_run && <circle cx={Number(row.hc_x)} cy={Number(row.hc_y)} r={radius + 2.4} fill="none" stroke={color} strokeWidth={0.8} strokeDasharray="2 1.5" />}
                  <circle cx={Number(row.hc_x)} cy={Number(row.hc_y)} r={radius} fill={color} stroke={isSelected ? '#fff' : '#071018'} strokeWidth={isSelected ? 1.25 : 0.7} filter={row.is_home_run ? `url(#spray-glow-${currentPark.venueId})` : undefined} />
                </g>
              )
            })}
            {selected && replay > 0 && (
              <g key={`${selectedKey}:${replay}`} className={styles.replayBall}>
                <path d={`M125 202 Q125 ${Math.max(40, Number(selected.hc_y) - 36)} ${Number(selected.hc_x)} ${Number(selected.hc_y)}`} fill="none" stroke={resultColor(selected)} strokeWidth={0.8} strokeDasharray="2 2" opacity={0.45} />
                <circle r="2.5" fill="#fff" stroke={resultColor(selected)} strokeWidth="1">
                  <animateMotion dur="760ms" fill="freeze" path={`M125 202 Q125 ${Math.max(40, Number(selected.hc_y) - 36)} ${Number(selected.hc_x)} ${Number(selected.hc_y)}`} />
                </circle>
              </g>
            )}
          </ParkFieldSvg>
          {fieldOverlay && <div className={styles.fieldOverlay}>{fieldOverlay}</div>}
          {!visibleRows.length && <div className={styles.empty}>No batted balls match these filters.</div>}
        </div>

        <aside className={styles.inspector} aria-live="polite">
          {selected ? (
            <>
              <div className={styles.inspectorTop}>
                <span className={styles.resultDot} style={{ background: resultColor(selected) }} />
                <div><p>{selected.is_near_hr && !selected.is_home_run ? 'Near-home-run contact' : eventLabel(selected.events)}</p><span>{formatDate(selected.game_date)} · {selected.venue_name ?? 'Original venue'}</span></div>
              </div>
              <div className={styles.metrics}>
                <span><small>Exit velocity</small><strong>{fmt(selected.launch_speed, ' mph')}</strong></span>
                <span title={resolveBattedBallDistance(selected).source === 'coordinate_estimate' ? 'Estimated from the Statcast landing coordinate' : undefined}><small>Distance</small><strong>{formatBattedBallDistance(selected, { unavailable: 'Not tracked' })}</strong></span>
                <span><small>Launch angle</small><strong>{fmt(selected.launch_angle, '°')}</strong></span>
                <span><small>Batted ball</small><strong>{selected.bb_type?.replaceAll('_', ' ') ?? 'Not tracked'}</strong></span>
              </div>
              <div className={styles.context}>
                <span>vs {selected.opponent_name ?? `Pitcher ${selected.pitcher_id}`}</span>
                <span>{selected.p_throws ? `${selected.p_throws}HP` : 'Hand unavailable'} · {selected.pitch_type ? pitchLabel(selected.pitch_type) : 'Pitch unavailable'}</span>
                {projection && <span className={styles.projected}>Projected onto {currentPark.name}</span>}
                {typeof selected.parks_hr_count === 'number' && (
                  <span className={styles.parkCount}><Layers3 size={14} /> Would leave {selected.parks_hr_count} of 30 MLB parks</span>
                )}
              </div>
              <button type="button" className={styles.replay} onClick={() => setReplay(value => value + 1)}><Play size={14} /> Replay contact</button>
            </>
          ) : <p className={styles.emptyInspector}>Select a marker to inspect the contact.</p>}
        </aside>
      </div>

      <footer className={styles.footer}>
        <div className={styles.legend}><span><i style={{ background: '#a3ff3f' }} /> HR</span><span><i style={{ background: '#ff9f43' }} /> Near HR</span><span><i style={{ background: '#30e6d0' }} /> Single</span><span><i style={{ background: '#49a8ff' }} /> Double</span><span><i style={{ background: '#d78cff' }} /> Triple</span><span><i style={{ background: '#a6b0c4' }} /> Out</span></div>
        <p>{projection ? `Historic Statcast contact locations overlaid on today's ${currentPark.name} shape and weather.` : 'Official Statcast coordinates and scoring. Park outlines are visual context and never determine the result.'}</p>
      </footer>
    </section>
  )
}
