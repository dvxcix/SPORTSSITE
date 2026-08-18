'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import Image from 'next/image'
import { CalendarDays, Crosshair, LoaderCircle, RotateCcw, Sparkles, Target } from 'lucide-react'
import { ContactFlightStage } from '@/components/contact/ContactFlightStage'
import { ParkFieldSvg } from '@/components/sports/ParkFieldSvg'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { getTeamColor, getTeamLogoUrl, getTeamSecondaryColor } from '@slipsurge/core/mlbTeamColors'
import type { ContactKind, DailyContactEvent, DailyContactSlate } from '@/lib/contactRecapTypes'
import styles from './SprayChartsExplorer.module.css'

type ResultFilter = 'all' | ContactKind

const resultLabels: Record<ResultFilter, string> = {
  all: 'All contact', home_run: 'Home runs', near_hr: 'Near HR', hit: 'Hits', out: 'Outs', other: 'Other BIP',
}

function resultColor(kind: ContactKind) {
  if (kind === 'home_run') return '#a3ff3f'
  if (kind === 'near_hr') return '#ff9f43'
  if (kind === 'hit') return '#38d9ff'
  if (kind === 'out') return '#8b96aa'
  return '#b894ff'
}

function eventLabel(event: DailyContactEvent) {
  if (event.kind === 'near_hr') return 'Near home run'
  return event.result.replaceAll('_', ' ').replace(/\b\w/g, value => value.toUpperCase())
}

function fmt(value: number | null, suffix = '') {
  return value == null ? 'Not tracked' : `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`
}

export function SprayChartsExplorer({ initialDate }: { initialDate: string }) {
  const [date, setDate] = useState(initialDate)
  const [data, setData] = useState<DailyContactSlate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [gamePk, setGamePk] = useState(0)
  const [playerId, setPlayerId] = useState(0)
  const [result, setResult] = useState<ResultFilter>('all')
  const [selectedId, setSelectedId] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let timer = 0
    const load = (background = false) => fetch(`/api/spray-charts?date=${encodeURIComponent(date)}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async response => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? 'Could not load spray charts.')
        return payload as DailyContactSlate
      })
      .then(payload => {
        setData(payload)
        setGamePk(current => {
          if (current && payload.games.some(game => game.gamePk === current)) return current
          const firstWithContact = payload.games.find(game => payload.contacts.some(event => event.gamePk === game.gamePk))
          return firstWithContact?.gamePk ?? payload.games[0]?.gamePk ?? 0
        })
        if (!background) { setPlayerId(0); setSelectedId('') }
      })
      .catch(fetchError => { if (fetchError.name !== 'AbortError' && !background) setError(fetchError.message) })
      .finally(() => { if (!controller.signal.aborted && !background) setLoading(false) })
    void load().then(() => {
      if (!controller.signal.aborted) timer = window.setInterval(() => { void load(true) }, 30_000)
    })
    return () => { controller.abort(); if (timer) window.clearInterval(timer) }
  }, [date])

  const game = data?.games.find(candidate => candidate.gamePk === gamePk) ?? null
  const gameEvents = useMemo(() => data?.contacts.filter(event => event.gamePk === gamePk) ?? [], [data, gamePk])
  const players = useMemo(() => Array.from(new Map(gameEvents.map(event => [event.batterId, {
    id: event.batterId, name: event.batterName, team: event.batterTeam,
  }])).values()).sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name)), [gameEvents])
  const visible = useMemo(() => gameEvents.filter(event => {
    if (playerId && event.batterId !== playerId) return false
    return result === 'all' || event.kind === result
  }), [gameEvents, playerId, result])
  const selected = visible.find(event => event.id === selectedId) ?? visible[0] ?? null
  const totals = useMemo(() => visible.reduce((summary, event) => {
    summary.contact += 1
    if (event.kind === 'home_run') summary.hr += 1
    if (event.kind === 'near_hr') summary.near += 1
    if (Number(event.exitVelocity) >= 95) summary.hard += 1
    return summary
  }, { contact: 0, hr: 0, near: 0, hard: 0 }), [visible])

  const reset = () => { setPlayerId(0); setResult('all'); setSelectedId('') }
  const changeDate = (nextDate: string) => {
    setLoading(true)
    setError('')
    setDate(nextDate)
  }
  const parkPrimary = game ? getTeamColor(game.parkTeamAbbr) : '#25314b'
  const parkSecondary = game ? getTeamSecondaryColor(game.parkTeamAbbr) : '#9ca8bb'
  const parkLogo = game ? getTeamLogoUrl(game.homeTeam) : ''

  return <main className={styles.page}>
    <header className={styles.hero}>
      <div className={styles.heroIcon}><Crosshair size={26}/></div>
      <div><p>ULTIMATE · STATCAST VISUAL LAB</p><h1>Spray Charts</h1><span>Replay every captured batted ball on the park where it happened.</span></div>
      <label className={styles.date}><CalendarDays size={15}/><span>Date</span><input type="date" value={date} onChange={event => changeDate(event.target.value)} /></label>
    </header>

    {loading ? <div className={styles.state}><LoaderCircle className={styles.spinner} size={30}/><strong>Loading park geometry and contact</strong></div> : null}
    {!loading && error ? <div className={styles.error}>{error}</div> : null}
    {!loading && !error && data ? <>
      <section className={styles.gameRail} aria-label="Select a game">
        {data.games.map(candidate => {
          const away = getTeamLogoUrl(candidate.awayTeam)
          const home = getTeamLogoUrl(candidate.homeTeam)
          const count = data.contacts.filter(event => event.gamePk === candidate.gamePk).length
          return <button key={candidate.gamePk} type="button" data-active={candidate.gamePk === gamePk} onClick={() => { setGamePk(candidate.gamePk); reset() }}>
            <em>Game {candidate.gameIndex + 1}</em><span>{away ? <Image src={away} alt={candidate.awayName} width={30} height={30}/> : null}<b>vs</b>{home ? <Image src={home} alt={candidate.homeName} width={30} height={30}/> : null}</span><small>{count} batted balls</small>
          </button>
        })}
      </section>

      <section className={styles.controls}>
        <div className={styles.controlHead}><div><Target size={16}/><span>Player layers</span><small>{players.length} captured batters</small></div><button type="button" onClick={reset}><RotateCcw size={13}/> Reset</button></div>
        <div className={styles.players}>
          <button type="button" data-active={!playerId} onClick={() => { setPlayerId(0); setSelectedId('') }}><span className={styles.allPlayers}><Sparkles size={16}/></span><b>All players</b><small>{gameEvents.length} contact</small></button>
          {players.map(player => {
            const logo = getTeamLogoUrl(player.team)
            const count = gameEvents.filter(event => event.batterId === player.id).length
            return <button type="button" key={player.id} data-active={playerId === player.id} onClick={() => { setPlayerId(player.id); setSelectedId('') }}>
              <span className={styles.avatar} style={{ '--team': getTeamColor(player.team) } as CSSProperties}><Image src={mlbHeadshot(player.id)} alt="" width={38} height={38}/>{logo ? <Image src={logo} alt="" width={15} height={15}/> : null}</span><b>{player.name}</b><small>{count} contact</small>
            </button>
          })}
        </div>
        <div className={styles.filters}>{(Object.keys(resultLabels) as ResultFilter[]).map(value => <button type="button" key={value} data-active={result === value} onClick={() => { setResult(value); setSelectedId('') }}>{resultLabels[value]}</button>)}</div>
      </section>

      <section className={styles.chartCard}>
        <header><div><p>EXACT PARK VIEW</p><h2>{game?.venueName ?? 'MLB ballpark'}</h2></div><div className={styles.stats}><span><b>{totals.contact}</b> BBE</span><span><b>{totals.hr}</b> HR</span><span><b>{totals.near}</b> near</span><span><b>{totals.contact ? Math.round(totals.hard / totals.contact * 100) : 0}%</b> hard hit</span></div></header>
        <div className={styles.workspace}>
          <div className={styles.parkStage}>
            {parkLogo ? <Image className={styles.watermark} src={parkLogo} alt="" width={150} height={150}/> : null}
            {game ? <ParkFieldSvg primary={parkPrimary} secondary={parkSecondary} teamAbbr={game.parkTeamAbbr} className={styles.field} ariaLabel={`Batted-ball spray chart at ${game.venueName}`}>
              <defs><filter id="slate-spray-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
              {visible.map(event => {
                const active = selected?.id === event.id
                const color = resultColor(event.kind)
                return <g key={event.id} className={styles.point} role="button" tabIndex={0} aria-label={`${eventLabel(event)} by ${event.batterName}`} onClick={() => setSelectedId(event.id)} onMouseEnter={() => setSelectedId(event.id)} onFocus={() => setSelectedId(event.id)} onKeyDown={keyEvent => { if (keyEvent.key === 'Enter' || keyEvent.key === ' ') { keyEvent.preventDefault(); setSelectedId(event.id) } }}>
                  {event.kind === 'near_hr' ? <circle cx={event.hcX} cy={event.hcY} r="6.4" fill="none" stroke={color} strokeWidth="1" strokeDasharray="2 1.5"/> : null}
                  <circle cx={event.hcX} cy={event.hcY} r={active ? 5 : 3.2} fill={color} stroke={active ? '#fff' : '#091018'} strokeWidth={active ? 1.3 : .7} filter={event.kind === 'home_run' ? 'url(#slate-spray-glow)' : undefined}/>
                </g>
              })}
            </ParkFieldSvg> : null}
            {!visible.length ? <div className={styles.empty}>No contact matches these filters.</div> : null}
          </div>
          <aside className={styles.inspector} aria-live="polite">
            {selected ? <><div className={styles.inspectIdentity}><span style={{ '--team': getTeamColor(selected.batterTeam) } as CSSProperties}><Image src={mlbHeadshot(selected.batterId)} alt="" width={58} height={58}/></span><div><small>{eventLabel(selected)}</small><h3>{selected.batterName}</h3><p>{selected.batterTeam} · off {selected.pitcherName}</p></div></div><div className={styles.inspectMetrics}><span><small>Exit velocity</small><b>{fmt(selected.exitVelocity, ' mph')}</b></span><span><small>Distance</small><b>{fmt(selected.distance, ' ft')}</b></span><span><small>Launch angle</small><b>{fmt(selected.launchAngle, '°')}</b></span><span><small>Game moment</small><b>{selected.half} {selected.inning ?? '-'}</b></span></div>{selected.coordinateSource === 'bearing_projection' ? <p className={styles.disclosure}>Landing point projected from the recorded distance and bearing.</p> : selected.coordinateSource === 'mlb_live' ? <p className={styles.official}>Official MLB live-game coordinate</p> : <p className={styles.official}>Official Statcast landing coordinate</p>}</> : <p>Select a marker to inspect the contact.</p>}
          </aside>
        </div>
        <footer><span><i style={{ background: '#a3ff3f' }}/> Home run</span><span><i style={{ background: '#ff9f43' }}/> Near HR</span><span><i style={{ background: '#38d9ff' }}/> Hit</span><span><i style={{ background: '#8b96aa' }}/> Out</span><span><i style={{ background: '#b894ff' }}/> Other BIP</span></footer>
      </section>

      <ContactFlightStage events={visible} title={playerId ? `${players.find(player => player.id === playerId)?.name ?? 'Player'} Flight Replay` : 'Game Contact Flight'} eyebrow="Selected game and filters" tone="all" />
    </> : null}
  </main>
}
