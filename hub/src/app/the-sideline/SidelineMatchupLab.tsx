'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import type { SidelineLens, SidelinePlayer, SidelineWindow } from './types'
import type { SidelineOddsBoard } from '@/lib/nflOddsTypes'
import { nflPrimaryMarket } from '@/lib/nflPrimaryMarket'
import { impliedProbabilityRatio } from '@/lib/nflMarketMath'
import { PlayerIdentity } from './SidelineResearchClient'
import controls from '@/components/product/ResearchControls.module.css'
import styles from './sidelineResearch.module.css'

type Metric = { key: keyof SidelinePlayer; label: string; suffix?: string }
const views: Record<string, Metric[]> = {
  'Role command': [{ key: 'volume', label: 'Volume score' }, { key: 'targetShare', label: 'Target share', suffix: '%' }, { key: 'carryShare', label: 'Carry share', suffix: '%' }, { key: 'evidence', label: 'Sample confidence' }],
  'Score zone': [{ key: 'redZone', label: 'Score-zone score' }, { key: 'redZoneLooks', label: 'Red-zone looks' }, { key: 'goalLineLooks', label: 'Goal-line looks' }, { key: 'touchdowns', label: 'TDs' }],
  'Receiving value': [{ key: 'receivingYards', label: 'Rec yards' }, { key: 'receptions', label: 'Catches' }, { key: 'catchRate', label: 'Catch rate', suffix: '%' }, { key: 'yacAboveExpected', label: 'YAC over expected' }, { key: 'separation', label: 'Separation' }, { key: 'targets', label: 'Targets' }],
  'Route leverage': [{ key: 'geometry', label: 'Route score' }, { key: 'airYards', label: 'aDOT' }, { key: 'airYardsShare', label: 'Air-yard share', suffix: '%' }, { key: 'separation', label: 'Separation' }, { key: 'catchRate', label: 'Catch rate', suffix: '%' }],
  'Ground game': [{ key: 'rushingYards', label: 'Rush yards' }, { key: 'carries', label: 'Carries' }, { key: 'carryShare', label: 'Carry share', suffix: '%' }, { key: 'rushOverExpected', label: 'RYOE' }, { key: 'breakaway', label: 'Breakaway score' }],
  'QB command': [{ key: 'passingYards', label: 'Pass yards' }, { key: 'passAttempts', label: 'Attempts' }, { key: 'completionRate', label: 'Completion rate', suffix: '%' }, { key: 'cpoe', label: 'CPOE' }, { key: 'timeToThrow', label: 'Time to throw', suffix: 's' }],
  'Explosive lanes': [{ key: 'breakaway', label: 'Burst score' }, { key: 'explosivePlays', label: 'Explosive plays' }, { key: 'yacAboveExpected', label: 'YAC over expected' }, { key: 'airYardsShare', label: 'Air-yard share', suffix: '%' }],
  'Market signal': [],
}

function marketPrice(player: SidelineOddsBoard['players'][number] | undefined, propType: string) {
  const market = nflPrimaryMarket(player ?? null, propType, 'fanduel')
  const offer = market?.offers.find(item => item.vendor === 'fanduel') ?? market?.offers[0]
  return offer?.current.odds ?? offer?.current.over ?? null
}

function odds(value: number | null) { return value == null ? '-' : value > 0 ? `+${value}` : String(value) }

function MarketSignal({ player }: { player: SidelineOddsBoard['players'][number] | undefined }) {
  const atd = marketPrice(player, 'anytime_td')
  const ftd = marketPrice(player, 'first_td')
  const atdPicks = Math.max(-1, ...(player?.publicPicks ?? []).filter(item => item.propType === 'anytime_td').map(item => item.picks))
  const ftdPicks = Math.max(-1, ...(player?.publicPicks ?? []).filter(item => item.propType === 'first_td').map(item => item.picks))
  const ratio = impliedProbabilityRatio(ftd, atd)
  const baseline = player?.tdBaselines?.find(item => item.vendor === 'fanduel' && item.propType === 'anytime_td')
  return <div className={styles.bookGrid}>
    <div className={styles.bookOffer}><span>FD anytime TD</span><b>{odds(atd)}</b></div>
    <div className={styles.bookOffer}><span>FD first TD</span><b>{odds(ftd)}</b></div>
    <div className={styles.bookOffer}><span>FTD : ATD</span><b>{ratio == null ? '-' : ratio.toFixed(2)}</b></div>
    <div className={styles.bookOffer}><span>ATD picks</span><b>{atdPicks < 0 ? '-' : atdPicks.toLocaleString()}</b></div>
    <div className={styles.bookOffer}><span>FTD picks</span><b>{ftdPicks < 0 ? '-' : ftdPicks.toLocaleString()}</b></div>
    <div className={styles.bookOffer}><span>Vs own baseline</span><b>{baseline?.deltaProbabilityPoints == null ? '-' : `${baseline.deltaProbabilityPoints > 0 ? '+' : ''}${baseline.deltaProbabilityPoints.toFixed(1)}pp`}</b></div>
  </div>
}

export function SidelineMatchupLab({ lens, board }: { lens: SidelineLens; board: SidelineOddsBoard }) {
  const [view, setView] = useState('Role command')
  const [window, setWindow] = useState<SidelineWindow>('season')
  const [search, setSearch] = useState('')
  const sample = lens.windows[window]
  const metrics = views[view]
  const boardById = useMemo(() => new Map(board.players.map(player => [player.gsisId, player])), [board.players])
  const teamAbbreviations = useMemo(() => new Set(sample.teams.map(team => team.team.abbr)), [sample.teams])
  const query = search.trim().toLowerCase()
  const players = useMemo(() => sample.players
    .filter(player => teamAbbreviations.has(player.team) && boardById.has(player.id) && `${player.name} ${player.team} ${player.position}`.toLowerCase().includes(query))
    .sort((a, b) => metrics[0]
      ? Number(b[metrics[0].key]) - Number(a[metrics[0].key])
      : (marketPrice(boardById.get(a.id), 'anytime_td') ?? 99999) - (marketPrice(boardById.get(b.id), 'anytime_td') ?? 99999)),
  [boardById, metrics, query, sample.players, teamAbbreviations])
  return <div className={styles.root}>
    <header><h1>Matchup Lab</h1><small>{lens.coverage.label}</small></header>
    <section className={styles.controls} aria-label="Matchup filters"><label>Player<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Player, team or position" /></label><label>Window<select value={window} onChange={event => setWindow(event.target.value as SidelineWindow)}><option value="season">Season</option>{[1, 3, 5, 10].map(n => <option key={n} value={`l${n}`}>Last {n}</option>)}</select></label><span>{players.length} players</span></section>
    <div className={controls.scrollRail} aria-label="Matchup research categories">{Object.keys(views).map(name => <button key={name} type="button" aria-pressed={name === view} className={`${controls.pill} ${name === view ? controls.pillActive : ''}`} onClick={() => setView(name)}>{name}</button>)}</div>
    <section className={styles.cards} aria-label="Team tendencies and opponent allowances">{sample.teams.map(profile => <article className={styles.card} data-tone="cyan" key={profile.team.abbr} style={{ '--team-color': profile.team.color } as CSSProperties}>
      <div className={styles.cardHead}><strong>{profile.team.abbr} team pulse</strong><span className={styles.bookCount}>{profile.plays.toLocaleString()} plays</span></div>
      <div className={styles.bookGrid}><div className={styles.bookOffer}><span>Neutral pass</span><b>{profile.neutralPassRate.toFixed(1)}%</b></div><div className={styles.bookOffer}><span>Success</span><b>{profile.successRate.toFixed(1)}%</b></div><div className={styles.bookOffer}><span>Explosive</span><b>{profile.explosiveRate.toFixed(1)}%</b></div><div className={styles.bookOffer}><span>RZ TD</span><b>{profile.redZoneTdRate.toFixed(1)}%</b></div><div className={styles.bookOffer}><span>Explosive allowed</span><b>{profile.defenseExplosiveAllowed.toFixed(1)}%</b></div></div>
    </article>)}</section>
    <div className={styles.cards}>{players.map(player => {
      const team = sample.teams.find(item => item.team.abbr === player.team)?.team
      const identity = boardById.get(player.id)
      return <article key={player.id} className={styles.card} data-tone={view === 'Ground game' ? 'amber' : ['Receiving value', 'Route leverage'].includes(view) ? 'cyan' : view === 'Market signal' ? 'violet' : 'lime'} style={{ '--team-color': team?.color ?? '#203d50' } as CSSProperties}>
        <div className={styles.cardHead}><PlayerIdentity player={identity ?? { id: 0, gsisId: player.id.startsWith('bdl-') ? undefined : player.id, name: player.name, team: player.team, position: player.position, headshot: player.headshot, headshotFallbacks: player.headshotFallbacks, markets: [] }} team={team} /><span className={styles.bookCount}>{player.games || '—'}{player.games === 1 ? ' game' : ' games'}</span></div>
        {view === 'Market signal' ? <MarketSignal player={identity} /> : <div className={styles.bookGrid}>{metrics.map(metric => {
          const value = player[metric.key]
          const available = !player.unavailableMetrics?.includes(metric.key) && typeof value === 'number' && Number.isFinite(value)
          return <div className={styles.bookOffer} key={metric.key}><span>{metric.label}</span><b>{available ? `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })}${metric.suffix ?? ''}` : '—'}</b></div>
        })}</div>}
      </article>
    })}</div>
    {!players.length && <p className={styles.empty}>No player data in this sample.</p>}
  </div>
}
