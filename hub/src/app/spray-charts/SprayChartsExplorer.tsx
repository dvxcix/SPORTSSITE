'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type WheelEvent } from 'react'
import Image from 'next/image'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Crosshair, Download, Flame, Layers3, Link2, LoaderCircle, RotateCcw, Share2, Sparkles, Target } from 'lucide-react'
import { ContactFlightStage } from '@/components/contact/ContactFlightStage'
import { ParkFieldSvg } from '@/components/sports/ParkFieldSvg'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { getTeamColor, getTeamLogoUrl, getTeamSecondaryColor } from '@slipsurge/core/mlbTeamColors'
import type { ContactKind, DailyContactEvent, DailyContactSlate } from '@/lib/contactRecapTypes'
import styles from './SprayChartsExplorer.module.css'

type ResultFilter = 'all' | 'home_run' | 'near_hr' | 'single' | 'double' | 'triple' | 'out' | 'other'
type ChartView = 'points' | 'heat'

const resultLabels: Record<ResultFilter, string> = {
  all: 'All contact', home_run: 'Home runs', near_hr: 'Near HR', single: 'Singles', double: 'Doubles', triple: 'Triples', out: 'Outs', other: 'Other BIP',
}
const todayEt = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
const isFinalStatus = (status: string) => /final|completed|game over/i.test(status)

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

function matchesResult(event: DailyContactEvent, result: ResultFilter) {
  if (result === 'all') return true
  if (result === 'single' || result === 'double' || result === 'triple') return event.result === result
  return event.kind === result
}

function fmt(value: number | null, suffix = '') {
  return value == null ? 'Not tracked' : `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`
}

export function SprayChartsExplorer({ initialDate, initialGamePk = 0, initialPlayers = [], initialResult = 'all', initialView = 'points' }: {
  initialDate: string
  initialGamePk?: number
  initialPlayers?: number[]
  initialResult?: ResultFilter
  initialView?: ChartView
}) {
  const [date, setDate] = useState(initialDate)
  const [data, setData] = useState<DailyContactSlate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [gamePk, setGamePk] = useState(initialGamePk)
  const [allPlayers, setAllPlayers] = useState(initialPlayers.length === 0)
  const [playerIds, setPlayerIds] = useState<number[]>(initialPlayers)
  const [result, setResult] = useState<ResultFilter>(initialResult)
  const [view, setView] = useState<ChartView>(initialView)
  const [selectedId, setSelectedId] = useState('')
  const [copied, setCopied] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState('')
  const parkStageRef = useRef<HTMLDivElement>(null)
  const gameRailRef = useRef<HTMLElement>(null)
  const [gameRailPosition, setGameRailPosition] = useState({ canGoBack: false, canGoForward: false })
  const gameCount = data?.games.length ?? 0

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
        setLastUpdatedAt(new Date().toISOString())
        setGamePk(current => {
          if (current && payload.games.some(game => game.gamePk === current)) return current
          const firstWithContact = payload.games.find(game => payload.contacts.some(event => event.gamePk === game.gamePk))
          return firstWithContact?.gamePk ?? payload.games[0]?.gamePk ?? 0
        })
        if (!background && !initialGamePk && !initialPlayers.length) { setAllPlayers(true); setPlayerIds([]); setSelectedId('') }
        return payload
      })
      .catch(fetchError => { if (fetchError.name !== 'AbortError' && !background) setError(fetchError.message) })
      .finally(() => { if (!controller.signal.aborted && !background) setLoading(false) })
    const scheduleRefresh = () => {
      if (controller.signal.aborted || date !== todayEt() || document.visibilityState !== 'visible') return
      timer = window.setTimeout(async () => {
        const payload = await load(true).catch(() => null)
        if (!controller.signal.aborted && payload && payload.games.some(game => !isFinalStatus(game.status))) scheduleRefresh()
      }, 30_000)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && date === todayEt()) {
        if (timer) window.clearTimeout(timer)
        void load(true).then(scheduleRefresh)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    void load().then(scheduleRefresh)
    return () => { controller.abort(); if (timer) window.clearTimeout(timer); document.removeEventListener('visibilitychange', onVisibility) }
  }, [date, initialGamePk, initialPlayers.length])

  useEffect(() => {
    const params = new URLSearchParams()
    params.set('date', date)
    if (gamePk) params.set('game', String(gamePk))
    if (!allPlayers && playerIds.length) params.set('players', playerIds.join(','))
    if (result !== 'all') params.set('result', result)
    if (view !== 'points') params.set('view', view)
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`)
  }, [allPlayers, date, gamePk, playerIds, result, view])

  useEffect(() => {
    const rail = gameRailRef.current
    if (!rail) return
    const updatePosition = () => {
      const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth)
      setGameRailPosition({
        canGoBack: rail.scrollLeft > 2,
        canGoForward: rail.scrollLeft < maxScroll - 2,
      })
    }
    updatePosition()
    rail.addEventListener('scroll', updatePosition, { passive: true })
    window.addEventListener('resize', updatePosition)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePosition)
    observer?.observe(rail)
    return () => {
      rail.removeEventListener('scroll', updatePosition)
      window.removeEventListener('resize', updatePosition)
      observer?.disconnect()
    }
  }, [gameCount])

  useEffect(() => {
    const activeGame = gameRailRef.current?.querySelector<HTMLButtonElement>('button[data-active="true"]')
    activeGame?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [gamePk])

  const game = data?.games.find(candidate => candidate.gamePk === gamePk) ?? null
  const gameEvents = useMemo(() => data?.contacts.filter(event => event.gamePk === gamePk) ?? [], [data, gamePk])
  const players = useMemo(() => Array.from(new Map(gameEvents.map(event => [event.batterId, {
    id: event.batterId, name: event.batterName, team: event.batterTeam,
  }])).values()).sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name)), [gameEvents])
  const visible = useMemo(() => gameEvents.filter(event => {
    if (!allPlayers && !playerIds.includes(event.batterId)) return false
    return matchesResult(event, result)
  }), [allPlayers, gameEvents, playerIds, result])
  const selected = visible.find(event => event.id === selectedId) ?? visible[0] ?? null
  const totals = useMemo(() => visible.reduce((summary, event) => {
    summary.contact += 1
    if (event.kind === 'home_run') summary.hr += 1
    if (event.kind === 'near_hr') summary.near += 1
    if (Number(event.exitVelocity) >= 95) summary.hard += 1
    return summary
  }, { contact: 0, hr: 0, near: 0, hard: 0 }), [visible])

  const reset = () => { setAllPlayers(true); setPlayerIds([]); setResult('all'); setView('points'); setSelectedId('') }
  const togglePlayer = (id: number) => {
    setAllPlayers(false)
    setPlayerIds(current => allPlayers ? [id] : current.includes(id) ? current.filter(value => value !== id) : [...current, id])
    setSelectedId('')
  }
  const changeDate = (nextDate: string) => {
    setLoading(true)
    setError('')
    setDate(nextDate)
  }
  const scrollGameRail = (direction: -1 | 1) => {
    const rail = gameRailRef.current
    if (!rail) return
    rail.scrollBy({ left: direction * Math.max(320, rail.clientWidth * .78), behavior: 'smooth' })
  }
  const translateGameWheel = (event: WheelEvent<HTMLElement>) => {
    const rail = gameRailRef.current
    if (!rail || rail.scrollWidth <= rail.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
    const maxScroll = rail.scrollWidth - rail.clientWidth
    const movingTowardStart = event.deltaY < 0 && rail.scrollLeft <= 0
    const movingTowardEnd = event.deltaY > 0 && rail.scrollLeft >= maxScroll - 1
    if (movingTowardStart || movingTowardEnd) return
    event.preventDefault()
    rail.scrollLeft += event.deltaY
  }
  const parkPrimary = game ? getTeamColor(game.parkTeamAbbr) : '#25314b'
  const parkSecondary = game ? getTeamSecondaryColor(game.parkTeamAbbr) : '#9ca8bb'
  const parkLogo = game ? getTeamLogoUrl(game.parkTeamAbbr) : ''
  const sourceCounts = useMemo(() => visible.reduce((summary, event) => {
    summary[event.coordinateSource] += 1
    return summary
  }, { statcast: 0, mlb_live: 0, bearing_projection: 0 }), [visible])
  const flightEvents = useMemo(() => selected
    ? [selected, ...visible.filter(event => event.id !== selected.id)]
    : visible, [selected, visible])
  const selectedFlightPath = selected
    ? `M125 203 Q${(125 + (selected.hcX - 125) * .34).toFixed(1)} ${Math.max(24, Math.min(selected.hcY, 203) - 72).toFixed(1)} ${selected.hcX.toFixed(1)} ${selected.hcY.toFixed(1)}`
    : ''

  const emptyMessage = !data?.games.length
    ? 'This slate is not available yet.'
    : game && !gameEvents.length && /pre|warmup|scheduled/i.test(game.status)
      ? 'Batted-ball tracking begins at first pitch.'
      : game && !gameEvents.length && isFinalStatus(game.status)
        ? 'No official batted-ball coordinates were captured for this game.'
        : game && !gameEvents.length
          ? 'Waiting for the first official batted-ball coordinate.'
          : 'No contact matches these filters.'

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }
  const share = async () => {
    if (navigator.share) await navigator.share({ title: 'SlipSurge Spray Chart', text: game ? `${game.awayName} at ${game.homeName}` : 'SlipSurge Spray Chart', url: window.location.href })
    else await copyLink()
  }
  const downloadPng = async () => {
    const svg = parkStageRef.current?.querySelector('svg')
    if (!svg) return
    const clone = svg.cloneNode(true) as SVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const serialized = new XMLSerializer().serializeToString(clone)
    const image = new window.Image()
    const objectUrl = URL.createObjectURL(new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' }))
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 1600; canvas.height = 1600
      const context = canvas.getContext('2d')
      if (!context) return
      context.fillStyle = '#05080d'; context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => {
        if (!blob) return
        const href = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = href; anchor.download = `slipsurge-spray-${date}-${gamePk || 'slate'}.png`; anchor.click()
        window.setTimeout(() => URL.revokeObjectURL(href), 5000)
      }, 'image/png')
      URL.revokeObjectURL(objectUrl)
    }
    image.src = objectUrl
  }

  return <main className={styles.page}>
    <header className={styles.hero}>
      <div className={styles.heroIcon}><Crosshair size={26}/></div>
      <div><p>ULTIMATE · STATCAST VISUAL LAB</p><h1>Spray Charts</h1><span>Replay every captured batted ball on the park where it happened.</span></div>
      <label className={styles.date}><CalendarDays size={15}/><span>Date</span><input type="date" value={date} onChange={event => changeDate(event.target.value)} /></label>
    </header>

    {loading ? <div className={styles.state}><LoaderCircle className={styles.spinner} size={30}/><strong>Loading park geometry and contact</strong></div> : null}
    {!loading && error ? <div className={styles.error}>{error}</div> : null}
    {!loading && !error && data ? <>
      <div className={styles.gameRailShell}>
        <button className={styles.gameRailNav} data-side="left" type="button" aria-label="Show earlier games" disabled={!gameRailPosition.canGoBack} onClick={() => scrollGameRail(-1)}><ChevronLeft size={18}/></button>
        <section ref={gameRailRef} className={styles.gameRail} aria-label="Select a game" tabIndex={0} onWheel={translateGameWheel}>
          {data.games.map(candidate => {
            const away = getTeamLogoUrl(candidate.awayTeam)
            const home = getTeamLogoUrl(candidate.homeTeam)
            const count = data.contacts.filter(event => event.gamePk === candidate.gamePk).length
            return <button key={candidate.gamePk} type="button" data-active={candidate.gamePk === gamePk} onClick={() => { setGamePk(candidate.gamePk); reset() }}>
              <em>Game {candidate.gameIndex + 1}</em><span>{away ? <Image src={away} alt={candidate.awayName} width={30} height={30}/> : null}<b>vs</b>{home ? <Image src={home} alt={candidate.homeName} width={30} height={30}/> : null}</span><small>{count} batted balls</small>
            </button>
          })}
        </section>
        <button className={styles.gameRailNav} data-side="right" type="button" aria-label="Show later games" disabled={!gameRailPosition.canGoForward} onClick={() => scrollGameRail(1)}><ChevronRight size={18}/></button>
      </div>

      <section className={styles.controls}>
        <div className={styles.controlHead}>
          <div><Target size={16}/><span>Player layers</span><small>{allPlayers ? `All ${players.length} captured batters` : `${playerIds.length} of ${players.length} selected`}</small></div>
          <div className={styles.controlActions}>
            <button type="button" onClick={() => { setAllPlayers(true); setPlayerIds([]); setSelectedId('') }}>Select all</button>
            <button type="button" onClick={() => { setAllPlayers(false); setPlayerIds([]); setSelectedId('') }}>Clear</button>
            <button type="button" onClick={reset}><RotateCcw size={13}/> Reset</button>
          </div>
        </div>
        <div className={styles.players}>
          <button type="button" data-active={allPlayers} onClick={() => { setAllPlayers(true); setPlayerIds([]); setSelectedId('') }}><span className={styles.allPlayers}><Sparkles size={16}/></span><b>All players</b><small>{gameEvents.length} contact</small></button>
          {players.map(player => {
            const logo = getTeamLogoUrl(player.team)
            const count = gameEvents.filter(event => event.batterId === player.id).length
            return <button type="button" key={player.id} data-active={!allPlayers && playerIds.includes(player.id)} aria-pressed={!allPlayers && playerIds.includes(player.id)} onClick={() => togglePlayer(player.id)}>
              <span className={styles.avatar} style={{ '--team': getTeamColor(player.team) } as CSSProperties}><Image src={mlbHeadshot(player.id)} alt="" width={38} height={38}/>{logo ? <Image src={logo} alt="" width={15} height={15}/> : null}</span><b>{player.name}</b><small>{count} contact</small>
            </button>
          })}
        </div>
        <div className={styles.filterBar}>
          <div className={styles.filters}>{(Object.keys(resultLabels) as ResultFilter[]).map(value => <button type="button" key={value} data-active={result === value} onClick={() => { setResult(value); setSelectedId('') }}>{resultLabels[value]}</button>)}</div>
          <div className={styles.viewToggle} aria-label="Chart style">
            <button type="button" data-active={view === 'points'} onClick={() => setView('points')}><Crosshair size={13}/> Points</button>
            <button type="button" data-active={view === 'heat'} onClick={() => setView('heat')}><Flame size={13}/> Heat</button>
          </div>
        </div>
      </section>

      <section className={styles.chartCard}>
        <header><div><p>{game?.parkTeamAbbr === 'MLB' ? 'NEUTRAL VENUE VIEW' : 'EXACT PARK VIEW'}</p><h2>{game?.venueName ?? 'MLB ballpark'}</h2><small className={styles.syncState}>{date === todayEt() && game && !isFinalStatus(game.status) ? 'Live refresh on' : 'Frozen view'}{lastUpdatedAt ? ` · updated ${new Date(lastUpdatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</small></div><div className={styles.shareActions}><button type="button" onClick={() => void copyLink()}>{copied ? <Check size={13}/> : <Link2 size={13}/>} {copied ? 'Copied' : 'Copy link'}</button><button type="button" onClick={() => void share()}><Share2 size={13}/> Share</button><button type="button" onClick={() => void downloadPng()}><Download size={13}/> PNG</button></div><div className={styles.stats}><span><b>{totals.contact}</b> BBE</span><span><b>{totals.hr}</b> HR</span><span><b>{totals.near}</b> near</span><span><b>{totals.contact ? Math.round(totals.hard / totals.contact * 100) : 0}%</b> hard hit</span></div></header>
        <div className={styles.workspace}>
          <div className={styles.parkStage} ref={parkStageRef}>
            {parkLogo ? <Image className={styles.watermark} src={parkLogo} alt="" width={150} height={150}/> : null}
            {game ? <ParkFieldSvg primary={parkPrimary} secondary={parkSecondary} teamAbbr={game.parkTeamAbbr} className={styles.field} ariaLabel={`Batted-ball spray chart at ${game.venueName}`}>
              <defs><filter id="slate-spray-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
              {selected ? <g key={`selected-flight-${selected.id}`} className={styles.selectedFlight}>
                <path d={selectedFlightPath} pathLength="1" fill="none" stroke={resultColor(selected.kind)} strokeWidth="1.6" strokeLinecap="round" filter="url(#slate-spray-glow)"/>
                <circle cx={selected.hcX} cy={selected.hcY} r="5.5" fill="none" stroke={resultColor(selected.kind)} strokeWidth=".9"/>
                <circle r="2.8" fill={resultColor(selected.kind)} stroke="#fff" strokeWidth=".65" filter="url(#slate-spray-glow)"><animateMotion dur="1.1s" fill="freeze" path={selectedFlightPath}/></circle>
              </g> : null}
              {visible.map(event => {
                const active = selected?.id === event.id
                const color = resultColor(event.kind)
                const radius = Math.max(2.7, Math.min(4.6, 2.7 + (Number(event.exitVelocity ?? 86) - 80) / 16))
                return <g key={event.id} className={`${styles.point} ${view === 'heat' ? styles.heatPoint : ''}`} role="button" tabIndex={0} aria-label={`${eventLabel(event)} by ${event.batterName}`} onClick={() => setSelectedId(event.id)} onMouseEnter={() => setSelectedId(event.id)} onFocus={() => setSelectedId(event.id)} onKeyDown={keyEvent => { if (keyEvent.key === 'Enter' || keyEvent.key === ' ') { keyEvent.preventDefault(); setSelectedId(event.id) } }}>
                  {view === 'heat' ? <circle cx={event.hcX} cy={event.hcY} r="14" fill={color} opacity=".28" filter="url(#slate-spray-glow)"/> : null}
                  {event.kind === 'near_hr' ? <circle cx={event.hcX} cy={event.hcY} r="6.4" fill="none" stroke={color} strokeWidth="1" strokeDasharray="2 1.5"/> : null}
                  <circle cx={event.hcX} cy={event.hcY} r={active ? radius + 1.8 : radius} fill={color} stroke={active ? '#fff' : getTeamColor(event.batterTeam)} strokeWidth={active ? 1.3 : .85} filter={event.kind === 'home_run' ? 'url(#slate-spray-glow)' : undefined}/>
                </g>
              })}
            </ParkFieldSvg> : null}
            {!visible.length ? <div className={styles.empty}>{emptyMessage}</div> : null}
          </div>
          <aside className={styles.inspector} aria-live="polite">
            {selected ? <><div className={styles.inspectIdentity}><span style={{ '--team': getTeamColor(selected.batterTeam) } as CSSProperties}><Image src={mlbHeadshot(selected.batterId)} alt="" width={58} height={58}/></span><div><small>{eventLabel(selected)}</small><h3>{selected.batterName}</h3><p>{selected.batterTeam} · off {selected.pitcherName}</p></div></div><div className={styles.inspectMetrics}><span><small>Exit velocity</small><b>{fmt(selected.exitVelocity, ' mph')}</b></span><span><small>Distance</small><b>{fmt(selected.distance, ' ft')}</b></span><span><small>Launch angle</small><b>{fmt(selected.launchAngle, '°')}</b></span><span><small>Game moment</small><b>{selected.half} {selected.inning ?? '-'}</b></span></div>{selected.coordinateSource === 'bearing_projection' ? <p className={styles.disclosure}>Landing point projected from the recorded distance and bearing.</p> : selected.coordinateSource === 'mlb_live' ? <p className={styles.official}>Official MLB live-game coordinate</p> : <p className={styles.official}>Official Statcast landing coordinate</p>}</> : <p>Select a marker to inspect the contact.</p>}
            {selected ? <div className={styles.inspectContext}>
              <span><small>Scored result</small><b>{selected.result.replaceAll('_', ' ')}</b></span>
              <span><small>Runs batted in</small><b>{selected.rbi}</b></span>
              <span><small>Pitch</small><b>{selected.pitchType ? `${selected.pitchType}${selected.pitchSpeed ? ` · ${fmt(selected.pitchSpeed, ' mph')}` : ''}` : 'Not tracked'}</b></span>
              <span><small>Batted ball</small><b>{selected.bbType?.replaceAll('_', ' ') ?? 'Not tracked'}</b></span>
              {selected.parksHrCount != null ? <p className={styles.parkCount}><Layers3 size={14}/> Would leave {selected.parksHrCount} of 30 MLB parks</p> : null}
            </div> : null}
          </aside>
        </div>
        <footer><div><span><i style={{ background: '#a3ff3f' }}/> Home run</span><span><i style={{ background: '#ff9f43' }}/> Near HR</span><span><i style={{ background: '#38d9ff' }}/> Hit</span><span><i style={{ background: '#8b96aa' }}/> Out</span><span><i style={{ background: '#b894ff' }}/> Other BIP</span></div><small>{sourceCounts.statcast} Statcast · {sourceCounts.mlb_live} live · {sourceCounts.bearing_projection} projected</small></footer>
      </section>

      <ContactFlightStage events={flightEvents} title={!allPlayers && playerIds.length === 1 ? `${players.find(player => player.id === playerIds[0])?.name ?? 'Player'} Flight Replay` : 'Game Contact Flight'} eyebrow="Selected game and filters" tone="all" />
    </> : null}
  </main>
}
