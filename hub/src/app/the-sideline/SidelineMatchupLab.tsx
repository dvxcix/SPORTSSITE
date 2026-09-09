'use client'

import { useState, type CSSProperties } from 'react'
import type { SidelineLens, SidelinePlayer, SidelineWindow } from './types'
import type { SidelineOddsBoard } from '@/lib/nflOddsTypes'
import { PlayerIdentity } from './SidelineResearchClient'
import controls from '@/components/product/ResearchControls.module.css'
import styles from './sidelineResearch.module.css'

type Metric = { key: keyof SidelinePlayer; label: string; suffix?: string }
const views: Record<string, Metric[]> = {
  'Team share': [{ key: 'targetShare', label: 'Target share', suffix: '%' }, { key: 'carryShare', label: 'Carry share', suffix: '%' }, { key: 'targets', label: 'Targets' }, { key: 'carries', label: 'Carries' }],
  'Red zone': [{ key: 'redZoneLooks', label: 'Red-zone looks' }, { key: 'goalLineLooks', label: 'Goal-line looks' }, { key: 'touchdowns', label: 'TDs' }],
  Receiving: [{ key: 'targets', label: 'Targets' }, { key: 'receptions', label: 'Catches' }, { key: 'receivingYards', label: 'Rec yards' }, { key: 'catchRate', label: 'Catch rate', suffix: '%' }, { key: 'airYards', label: 'aDOT' }, { key: 'separation', label: 'Separation' }],
  Rushing: [{ key: 'carries', label: 'Carries' }, { key: 'rushingYards', label: 'Rush yards' }, { key: 'carryShare', label: 'Carry share', suffix: '%' }, { key: 'rushOverExpected', label: 'RYOE' }],
  Passing: [{ key: 'passAttempts', label: 'Attempts' }, { key: 'passingYards', label: 'Pass yards' }, { key: 'completionRate', label: 'Completion rate', suffix: '%' }, { key: 'cpoe', label: 'CPOE' }, { key: 'timeToThrow', label: 'Time to throw', suffix: 's' }],
  Explosives: [{ key: 'explosivePlays', label: 'Explosive plays' }, { key: 'yacAboveExpected', label: 'YAC over expected' }, { key: 'airYardsShare', label: 'Air-yard share', suffix: '%' }],
}

export function SidelineMatchupLab({ lens, board }: { lens: SidelineLens; board: SidelineOddsBoard }) {
  const [view, setView] = useState('Team share')
  const [window, setWindow] = useState<SidelineWindow>('season')
  const [search, setSearch] = useState('')
  const sample = lens.windows[window]
  const metrics = views[view]
  const rosterIds = new Set(board.players.filter(player => sample.teams.some(team => team.team.abbr === player.team)).map(player => player.gsisId))
  const players = sample.players.filter(player => rosterIds.has(player.id) && `${player.name} ${player.team} ${player.position}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => Number(b[metrics[0].key]) - Number(a[metrics[0].key]))
  return <main className={styles.root}>
    <header><h1>Matchup Lab</h1><small>{lens.coverage.label}</small></header>
    <section className={styles.controls} aria-label="Matchup filters"><label>Player<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Player, team or position" /></label><label>Window<select value={window} onChange={event => setWindow(event.target.value as SidelineWindow)}><option value="season">Season</option>{[1, 3, 5, 10].map(n => <option key={n} value={`l${n}`}>Last {n}</option>)}</select></label><span>{players.length} players</span></section>
    <div className={controls.scrollRail} aria-label="Matchup research categories">{Object.keys(views).map(name => <button key={name} type="button" aria-pressed={name === view} className={`${controls.pill} ${name === view ? controls.pillActive : ''}`} onClick={() => setView(name)}>{name}</button>)}</div>
    <div className={styles.cards}>{players.map(player => {
      const team = sample.teams.find(item => item.team.abbr === player.team)?.team
      const identity = board.players.find(item => item.gsisId === player.id)
      return <article key={player.id} className={styles.card} data-tone={view === 'Rushing' ? 'amber' : view === 'Receiving' ? 'cyan' : 'lime'} style={{ '--team-color': team?.color ?? '#203d50' } as CSSProperties}>
        <div className={styles.cardHead}><PlayerIdentity player={identity ?? { id: 0, gsisId: player.id.startsWith('bdl-') ? undefined : player.id, name: player.name, team: player.team, position: player.position, headshot: player.headshot, headshotFallbacks: player.headshotFallbacks, markets: [] }} team={team} /><span className={styles.bookCount}>{player.games || '—'}{player.games === 1 ? ' game' : ' games'}</span></div>
        <div className={styles.bookGrid}>{metrics.map(metric => {
          const value = player[metric.key]
          const available = !player.unavailableMetrics?.includes(metric.key) && typeof value === 'number' && Number.isFinite(value)
          return <div className={styles.bookOffer} key={metric.key}><span>{metric.label}</span><b>{available ? `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })}${metric.suffix ?? ''}` : '—'}</b></div>
        })}</div>
      </article>
    })}</div>
    {!players.length && <p className={styles.empty}>No player data in this sample.</p>}
  </main>
}
