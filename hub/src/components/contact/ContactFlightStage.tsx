'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Gauge, Maximize2, Pause, Play, RotateCcw } from 'lucide-react'
import { ParkFieldSvg } from '@/components/sports/ParkFieldSvg'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { getTeamColor, getTeamLogoUrl, getTeamSecondaryColor } from '@slipsurge/core/mlbTeamColors'
import type { DailyContactEvent } from '@/lib/contactRecapTypes'
import styles from './ContactFlightStage.module.css'

const fmt = (value: number | null, suffix: string) => value == null ? '-' : `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`
const eventName = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())

export function ContactFlightStage({ events, title, eyebrow, tone = 'home_run' }: {
  events: DailyContactEvent[]
  title: string
  eyebrow: string
  tone?: 'home_run' | 'near_hr' | 'all'
}) {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [replay, setReplay] = useState(0)
  const [speed, setSpeed] = useState(1)
  const shellRef = useRef<HTMLElement>(null)
  const currentIndex = events.length ? index % events.length : 0
  const current = events[currentIndex]

  useEffect(() => {
    if (!playing || events.length < 2) return
    const timer = window.setTimeout(() => {
      setIndex(value => (value + 1) % events.length)
      setReplay(value => value + 1)
    }, 3200 / speed)
    return () => window.clearTimeout(timer)
  }, [events.length, currentIndex, playing, replay, speed])

  const games = useMemo(() => Array.from(new Map(events.map(event => [event.gamePk, event.game])).values()), [events])
  const seek = (next: number) => {
    setIndex((next + events.length) % events.length)
    setReplay(value => value + 1)
  }
  const cycleSpeed = () => setSpeed(value => value === .75 ? 1 : value === 1 ? 1.5 : .75)
  const enterTheater = async () => {
    if (!shellRef.current || !document.fullscreenEnabled) return
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await shellRef.current.requestFullscreen()
    } catch {
      // Fullscreen can be denied by browser or device policy; the replay remains usable inline.
    }
  }

  if (!current) {
    const emptyLabel = tone === 'near_hr' ? 'near home runs' : tone === 'home_run' ? 'home runs' : 'batted balls'
    return <section className={styles.shell}><div className={styles.empty}><div><strong>No {emptyLabel} captured</strong><p>This section will populate automatically as official events arrive.</p></div></div></section>
  }

  const primary = getTeamColor(current.game.parkTeamAbbr)
  const secondary = getTeamSecondaryColor(current.game.parkTeamAbbr)
  const batterLogo = getTeamLogoUrl(current.batterTeam)
  const parkLogo = getTeamLogoUrl(current.game.parkTeamAbbr)
  const homeLogo = getTeamLogoUrl(current.game.homeTeam)
  const awayLogo = getTeamLogoUrl(current.game.awayTeam)
  const stroke = current.kind === 'home_run' ? '#a3ff3f' : current.kind === 'near_hr' ? '#ff9f43' : current.kind === 'hit' ? '#47d9ff' : current.kind === 'out' ? '#8b96aa' : '#b894ff'
  const controlX = 125 + (current.hcX - 125) * .34
  const controlY = Math.max(24, Math.min(current.hcY, 203) - 72)
  const path = `M125 203 Q${controlX.toFixed(1)} ${controlY.toFixed(1)} ${current.hcX.toFixed(1)} ${current.hcY.toFixed(1)}`
  const svgId = current.id.replace(/[^a-zA-Z0-9_-]/g, '-')
  const marketKeys = new Set(current.marketContext?.specials.map(quote => quote.marketKey) ?? [])
  const badges = [
    current.isFirstHr ? 'First HR' : null,
    current.isGrandSlam ? 'Grand slam' : null,
    marketKeys.has('pa1') ? '1st PA HR' : null,
    marketKeys.has('hr2') ? '2+ home runs' : null,
    marketKeys.has('hrMl') ? 'HR + team win' : null,
    Number(current.exitVelocity) >= 110 ? '110+ laser' : Number(current.exitVelocity) >= 105 ? '105+ laser' : null,
    Number(current.distance) >= 420 ? 'Moonshot' : null,
    current.kind === 'near_hr' && current.parksHrCount != null ? `${current.parksHrCount} parks` : null,
  ].filter((badge): badge is string => Boolean(badge))

  return <section className={styles.shell} ref={shellRef} style={{ '--park-primary': primary, '--park-secondary': secondary, '--flight-accent': stroke } as CSSProperties}>
    <header className={styles.topbar}><div><p className={styles.eyebrow}>{eyebrow}</p><h2 className={styles.title}>{title}</h2></div><span className={styles.count}>{events.length} event{events.length === 1 ? '' : 's'}</span></header>
    <div className={styles.stage} key={`${current.id}:${replay}`}>
      <div className={styles.grid} />
      <div className={styles.aurora} />
      <div className={styles.scorebug}>
        {awayLogo ? <Image src={awayLogo} alt={current.game.awayName} width={30} height={30} /> : null}
        <div><span className={styles.gameNumber}>Game {current.game.gameIndex + 1}</span><b>{current.game.awayTeam} {current.game.awayScore ?? ''} vs {current.game.homeTeam} {current.game.homeScore ?? ''}</b><span>{current.game.venueName}</span></div>
        {homeLogo ? <Image src={homeLogo} alt={current.game.homeName} width={30} height={30} /> : null}
      </div>
      {current.coordinateSource === 'bearing_projection' ? <div className={styles.projection}>Distance and bearing projection using official contact metrics</div> : null}
      {parkLogo ? <Image className={styles.parkLogo} src={parkLogo} alt="" width={120} height={120} /> : null}
      <ParkFieldSvg primary={primary} secondary={secondary} teamAbbr={current.game.parkTeamAbbr} className={styles.park} ariaLabel={`${current.batterName} contact at ${current.game.venueName}`}>
        <defs><filter id={`contact-glow-${svgId}`} x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="2.2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
        <path className={styles.flightGlow} d={path} fill="none" stroke={stroke} strokeWidth="5.5" strokeLinecap="round" opacity=".18" filter={`url(#contact-glow-${svgId})`} />
        <path className={styles.flight} d={path} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" filter={`url(#contact-glow-${svgId})`} />
        <circle className={styles.runner} r="3.1" fill={stroke} stroke="#fff" strokeWidth=".8" filter={`url(#contact-glow-${svgId})`}>
          <animateMotion dur={`${1.2 / speed}s`} fill="freeze" path={path} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".16 1 .3 1" />
        </circle>
        <circle className={styles.landingRingOne} cx={current.hcX} cy={current.hcY} r="4.2" fill="none" stroke={stroke} strokeWidth="1" />
        <circle className={styles.landingRingTwo} cx={current.hcX} cy={current.hcY} r="4.2" fill="none" stroke={stroke} strokeWidth=".8" />
        <circle className={styles.ball} cx={current.hcX} cy={current.hcY} r="4.2" fill={stroke} stroke="#fff" strokeWidth="1" filter={`url(#contact-glow-${svgId})`} />
      </ParkFieldSvg>
      <div className={styles.identity}>
        <div className={styles.headshot} style={{ '--team': getTeamColor(current.batterTeam) } as CSSProperties}>
          <Image src={mlbHeadshot(current.batterId)} alt={current.batterName} width={70} height={70} />
          {batterLogo ? <Image className={styles.miniLogo} src={batterLogo} alt="" width={24} height={24} /> : null}
        </div>
        <div><div className={styles.badges}>{badges.map(badge => <span className={styles.badge} key={badge}>{badge}</span>)}</div><h3>{current.batterName}</h3><p>{current.batterTeam} · {eventName(current.result)} · {current.half} {current.inning ?? '-'}</p><p>off {current.pitcherName}{current.rbi ? ` · ${current.rbi} RBI` : ''}</p></div>
      </div>
      <div className={styles.metrics}><div className={styles.metric}><span>Exit velo</span><strong>{fmt(current.exitVelocity, ' mph')}</strong></div><div className={styles.metric}><span>Distance</span><strong>{fmt(current.distance, ' ft')}</strong></div><div className={styles.metric}><span>Launch</span><strong>{fmt(current.launchAngle, '°')}</strong></div></div>
    </div>
    <div className={styles.controls}>
      <button className={styles.control} type="button" onClick={() => seek(currentIndex - 1)} aria-label="Previous event"><ChevronLeft size={16}/></button>
      <button className={styles.control} type="button" onClick={() => setPlaying(value => !value)} aria-label={playing ? 'Pause recap' : 'Play recap'}>{playing ? <Pause size={15}/> : <Play size={15}/>}</button>
      <button className={styles.control} type="button" onClick={() => setReplay(value => value + 1)} aria-label="Replay event"><RotateCcw size={15}/></button>
      <button className={`${styles.control} ${styles.speed}`} type="button" onClick={cycleSpeed} aria-label={`Playback speed ${speed} times`} title="Playback speed"><Gauge size={14}/><span>{speed}x</span></button>
      <div className={styles.progress}><span style={{ width: `${((currentIndex + 1) / events.length) * 100}%` }}/></div><span className={styles.counter}>{currentIndex + 1} / {events.length}</span>
      <button className={styles.control} type="button" onClick={enterTheater} aria-label="Open theater mode" title="Theater mode"><Maximize2 size={15}/></button>
      <button className={styles.control} type="button" onClick={() => seek(currentIndex + 1)} aria-label="Next event"><ChevronRight size={16}/></button>
    </div>
    <div className={styles.eventRail} aria-label="Contact replay timeline">{events.map((event, eventIndex) => {
      const logo = getTeamLogoUrl(event.batterTeam)
      return <button type="button" data-active={eventIndex === currentIndex} key={event.id} onClick={() => seek(eventIndex)} aria-label={`Replay ${event.batterName}, ${eventName(event.result)}`}>
        <span>{logo ? <Image src={logo} alt="" width={18} height={18}/> : eventIndex + 1}</span><b>{event.batterName}</b><small>{eventName(event.result)}</small>
      </button>
    })}</div>
    <div className={styles.gameRail}>{games.map(game => {
      const first = events.findIndex(event => event.gamePk === game.gamePk)
      const away = getTeamLogoUrl(game.awayTeam)
      const home = getTeamLogoUrl(game.homeTeam)
      return <button type="button" className={styles.gameChip} data-active={current.gamePk === game.gamePk} key={game.gamePk} onClick={() => seek(first)}>{away ? <Image src={away} alt="" width={17} height={17}/> : null}<span>G{game.gameIndex + 1} · {game.awayTeam}/{game.homeTeam}</span>{home ? <Image src={home} alt="" width={17} height={17}/> : null}</button>
    })}</div>
  </section>
}
