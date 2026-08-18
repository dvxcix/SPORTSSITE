'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { AlertTriangle, Atom, CheckCircle2, ChevronRight, Dna, Gauge, Orbit, RefreshCw, Sparkles, Target } from 'lucide-react'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { getTeamColor, getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import type { GameMechanicsResult, MechanicsPlayer, MechanicsWindow } from '@/lib/hrMechanics'
import styles from './MechanicsLab.module.css'

const WINDOWS: MechanicsWindow[] = [1, 3, 5, 10]
const PITCH_COLORS: Record<string, string> = {
  FF: '#ff5f6d', SI: '#ff9f43', FC: '#f4c95d', SL: '#a970ff', ST: '#cf6cff',
  CU: '#42d6a4', KC: '#28bfa2', CH: '#4eb8ff', FS: '#27d4ef', SV: '#ff75b5',
}

function scoreTone(score: number) {
  if (score >= 70) return 'elite'
  if (score >= 58) return 'positive'
  if (score < 40) return 'cold'
  return 'neutral'
}

function ScoreRing({ score, label, size = 'large' }: { score: number; label: string; size?: 'large' | 'small' }) {
  return (
    <div className={styles.scoreRing} data-size={size} data-tone={scoreTone(score)} style={{ '--score': `${score * 3.6}deg` } as CSSProperties}>
      <span><strong>{Math.round(score)}</strong><small>{label}</small></span>
    </div>
  )
}

function PlayerIdentity({ player, compact = false }: { player: MechanicsPlayer; compact?: boolean }) {
  return (
    <div className={styles.playerIdentity}>
      <div className={styles.headshot} style={{ '--team': getTeamColor(player.team) } as CSSProperties}>
        <img src={mlbHeadshot(player.playerId)} alt="" />
        <span><img src={getTeamLogoUrl(player.team)} alt={`${player.team} logo`} /></span>
      </div>
      <div><strong>{player.playerName}</strong><small>{player.team} · #{player.battingOrder} · {player.position}{!compact && ` · ${player.bats}HB`}</small></div>
    </div>
  )
}

function Metric({ label, value, suffix = '' }: { label: string; value: number | null; suffix?: string }) {
  return <div className={styles.metric}><small>{label}</small><strong>{value == null ? '—' : `${value}${suffix}`}</strong></div>
}

function PlaneVisual({ player }: { player: MechanicsPlayer }) {
  const angle = player.metrics.attackAngle ?? 0
  const y = 90 - Math.max(-15, Math.min(35, angle)) * 1.5
  return (
    <div className={styles.planeVisual} aria-label={`Recent attack angle ${angle} degrees`}>
      <svg viewBox="0 0 260 120" role="img">
        <defs><linearGradient id="plane" x1="0" x2="1"><stop stopColor="#a6ff3f"/><stop offset="1" stopColor="#47d7ff"/></linearGradient></defs>
        <path className={styles.zoneBand} d="M20 78 C85 61 145 48 240 35 L240 58 C155 67 90 78 20 98Z" />
        <path className={styles.swingPath} d={`M18 98 Q105 ${y} 242 ${Math.max(18, y - 15)}`} />
        <circle cx="181" cy={Math.max(22, y - 4)} r="6" fill="url(#plane)" />
        <line x1="20" y1="98" x2="242" y2="98" />
      </svg>
      <div><span><i />Productive lift band</span><strong>{angle > 0 ? '+' : ''}{angle.toFixed(1)}°</strong></div>
    </div>
  )
}

function PlayerRow({ player, active, onClick }: { player: MechanicsPlayer; active: boolean; onClick: () => void }) {
  return (
    <button className={styles.playerRow} data-active={active} type="button" onClick={onClick}>
      <span className={styles.rank}>{player.rank.toString().padStart(2, '0')}</span>
      <PlayerIdentity player={player} compact />
      <span className={styles.miniScores}><i style={{ width: `${player.scores.overall}%` }} /><small>{player.scores.trend >= 55 ? 'RISING' : player.scores.trend <= 42 ? 'COOLING' : 'STABLE'}</small></span>
      <ScoreRing score={player.scores.overall} label="INDEX" size="small" />
      <ChevronRight size={15} />
    </button>
  )
}

export function MechanicsLab({ date, gamePk, awayTeam, homeTeam }: { date: string; gamePk: number; awayTeam: string; homeTeam: string }) {
  const [window, setWindow] = useState<MechanicsWindow>(5)
  const [data, setData] = useState<GameMechanicsResult | null>(null)
  const [requestError, setRequestError] = useState<{ key: string; message: string } | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const requestKey = `${date}:${gamePk}:${window}`

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/research/mechanics?date=${date}&gamePk=${gamePk}&window=${window}`, { signal: controller.signal })
      .then(async response => {
        const body = await response.json().catch(() => null)
        if (!response.ok) throw new Error(body?.error ?? 'Mechanics data could not be loaded.')
        return body as GameMechanicsResult
      })
      .then(body => { setData(body); setSelectedId(current => body.players.some(player => player.playerId === current) ? current : body.players[0]?.playerId ?? null) })
      .catch(cause => {
        if (cause?.name !== 'AbortError') {
          setRequestError({ key: requestKey, message: cause instanceof Error ? cause.message : 'Mechanics data could not be loaded.' })
        }
      })
    return () => controller.abort()
  }, [date, gamePk, requestKey, window])

  const currentData = data?.gameDate === date && data.gamePk === gamePk && data.window === window ? data : null
  const error = requestError?.key === requestKey ? requestError.message : null
  const selected = useMemo(() => currentData?.players.find(player => player.playerId === selectedId) ?? currentData?.players[0] ?? null, [currentData, selectedId])
  const away = currentData?.players.filter(player => player.team === awayTeam).sort((a, b) => a.battingOrder - b.battingOrder) ?? []
  const home = currentData?.players.filter(player => player.team === homeTeam).sort((a, b) => a.battingOrder - b.battingOrder) ?? []

  if (!currentData && !error) return <div className={styles.state}><RefreshCw className={styles.spin} /><strong>Building the 18-player mechanics field</strong><small>Comparing measured swing formation, contact shape and starter vulnerability.</small></div>
  if (error) return <div className={styles.state} data-error><AlertTriangle /><strong>Mechanics field unavailable</strong><small>{error}</small></div>
  if (!currentData || !selected) return <div className={styles.state}><Atom /><strong>No qualified mechanics field</strong><small>Both lineups and their Statcast history are required.</small></div>

  const result = currentData

  return (
    <div className={styles.lab}>
      <header className={styles.labHeader}>
        <div className={styles.labTitle}><div><Dna /><i /></div><span><small>HR MECHANICS ENGINE</small><h2>Measured swing readiness</h2><p>Physics-calibrated MLB evidence, ranked across the complete game.</p></span></div>
        <div className={styles.windowControl}><small>ROLLING FORM</small><div>{WINDOWS.map(value => <button key={value} type="button" data-active={window === value} onClick={() => setWindow(value)}>L{value}</button>)}</div></div>
      </header>

      <section className={styles.calibrationStrip}>
        <span><Atom /><b>{result.calibration.label}</b></span>
        <span><strong>{result.calibration.swings}</strong><small>measured swings</small></span>
        <span><strong>±{result.calibration.transferMaeMph}</strong><small>EV transfer MAE</small></span>
        <span><strong>±{result.calibration.carryMaeFeet}</strong><small>carry MAE</small></span>
        <a href={result.calibration.repository} target="_blank" rel="noreferrer">Method source <ChevronRight /></a>
      </section>

      <section className={styles.leaderGrid}>
        <article className={styles.leaderCard} style={{ '--team': getTeamColor(selected.team) } as CSSProperties}>
          <div className={styles.leaderTop}><span>#{selected.rank} COMPLETE GAME PROFILE</span><b>{result.lineupConfirmed ? 'CONFIRMED LINEUP' : 'PROJECTED LINEUP'}</b></div>
          <div className={styles.leaderMain}>
            <PlayerIdentity player={selected} />
            <ScoreRing score={selected.scores.overall} label="READINESS" />
          </div>
          <div className={styles.componentGrid}>
            {[
              ['Power', selected.scores.powerFormation], ['Transfer', selected.scores.transferEfficiency],
              ['Plane', selected.scores.planeMatch], ['Timing', selected.scores.timing],
              ['Trajectory', selected.scores.trajectory], ['Pitcher risk', selected.scores.pitcherBreakdown],
            ].map(([label, score]) => <div key={String(label)}><span><small>{label}</small><b>{Math.round(Number(score))}</b></span><i><em style={{ width: `${score}%` }} /></i></div>)}
          </div>
        </article>
        <PlaneVisual player={selected} />
      </section>

      <section className={styles.boardAndInspector}>
        <div className={styles.lineupBoard}>
          <header><span><img src={getTeamLogoUrl(awayTeam)} alt="" />{awayTeam}</span><small>AWAY LINEUP</small></header>
          {away.map(player => <PlayerRow key={player.playerId} player={player} active={player.playerId === selected.playerId} onClick={() => setSelectedId(player.playerId)} />)}
          <header><span><img src={getTeamLogoUrl(homeTeam)} alt="" />{homeTeam}</span><small>HOME LINEUP</small></header>
          {home.map(player => <PlayerRow key={player.playerId} player={player} active={player.playerId === selected.playerId} onClick={() => setSelectedId(player.playerId)} />)}
        </div>

        <aside className={styles.inspector}>
          <header><span><Orbit />PLAYER INSPECTOR</span><small>{selected.pitcherName ? `vs ${selected.pitcherName} (${selected.pitcherHand}HP)` : 'Starter unavailable'}</small></header>
          <div className={styles.metricGrid}>
            <Metric label="BAT SPEED" value={selected.metrics.batSpeed} suffix=" mph" />
            <Metric label="ATTACK ANGLE" value={selected.metrics.attackAngle} suffix="°" />
            <Metric label="BLAST RATE" value={selected.metrics.blastRate} suffix="%" />
            <Metric label="SQUARED UP" value={selected.metrics.squaredUpRate} suffix="%" />
            <Metric label="ON TIME" value={selected.metrics.onTimeRate} suffix="%" />
            <Metric label="BARREL RATE" value={selected.metrics.barrelRate} suffix="%" />
            <Metric label="AVG EXIT VELO" value={selected.metrics.exitVelocity} suffix=" mph" />
            <Metric label="TRANSFER DELTA" value={selected.metrics.transferDelta} suffix=" mph" />
          </div>

          <div className={styles.readout}>
            <h3><Sparkles />Why this profile ranks here</h3>
            {selected.reasons.map(reason => <p key={reason}><CheckCircle2 />{reason}</p>)}
            {selected.cautions.map(caution => <p key={caution} data-caution><AlertTriangle />{caution}</p>)}
          </div>

          <div className={styles.pitcherPanel}>
            <h3><Gauge />Starter breakdown risk</h3>
            <div className={styles.pitcherSummary}>
              <Metric label="HR / BBE" value={selected.pitcher.hrRate} suffix="%" />
              <Metric label="BARREL" value={selected.pitcher.barrelRate} suffix="%" />
              <Metric label="HARD HIT" value={selected.pitcher.hardHitRate} suffix="%" />
            </div>
            <div className={styles.pitchMix}>{selected.pitcher.pitchShapes.map(pitch => <div key={pitch.pitchType} style={{ '--pitch': PITCH_COLORS[pitch.pitchType] ?? '#a6ff3f' } as CSSProperties}><span><i />{pitch.pitchType}<small>{pitch.velocity == null ? '' : `${pitch.velocity} mph`}</small></span><b>{pitch.usage}%</b></div>)}</div>
          </div>

          <footer><Target /><span><b>Confidence {Math.round(selected.scores.confidence)}%</b><small>Measured coverage and sample depth, not HR probability.</small></span></footer>
        </aside>
      </section>

      <p className={styles.methodNote}>{result.calibration.limitation}</p>
    </div>
  )
}
