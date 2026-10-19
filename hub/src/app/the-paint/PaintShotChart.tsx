'use client'
import { useEffect, useMemo, useState } from 'react'
import { nbaAppeared, type PaintPlayer } from '@/lib/nbaPaint'
import type { NbaShot } from '@/lib/nbaShots'
import styles from './paint.module.css'
type ShotResult = { gameId: number; playerId: number; shots: NbaShot[]; boxScoreAttempts: number | null; coverageMatches: boolean; fetchedAt: string; stale: boolean }
export function PaintShotChart({ player }: { player: PaintPlayer }) {
  const games = useMemo(() => [...new Map(player.logs.filter(log => (log.game.season ?? 0) >= 2025 && (log.game.status === 'Final' || log.game.status_state === 'final') && nbaAppeared(log)).map(log => [log.game.id, log.game])).values()].sort((a, b) => b.date.localeCompare(a.date)), [player.logs])
  const [gameId, setGameId] = useState(games[0]?.id ?? 0), [result, setResult] = useState<ShotResult | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  const [period, setPeriod] = useState('all'), [outcome, setOutcome] = useState('all'), [points, setPoints] = useState('all'), [selected, setSelected] = useState<number | null>(null), [heat, setHeat] = useState(false)
  useEffect(() => {
    if (!gameId) return
    const controller = new AbortController(); let timedOut = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, 55000)
    fetch(`/the-paint/shots?game=${gameId}&player=${player.id}`, { cache: 'no-store', signal: controller.signal }).then(async response => { if (!response.ok) throw new Error('Shot locations unavailable'); return response.json() }).then(data => { if (!controller.signal.aborted) { if (data.gameId !== gameId || data.playerId !== player.id || !Array.isArray(data.shots)) throw new Error('Shot identity mismatch'); setResult(data); setError('') } }).catch(() => { if (!controller.signal.aborted || timedOut) setError(timedOut ? 'Shot locations timed out.' : 'Shot locations could not load.') }).finally(() => clearTimeout(timer))
    return () => { controller.abort(); clearTimeout(timer) }
  }, [gameId, player.id, retry])
  const current = result?.gameId === gameId && result.playerId === player.id ? result : null
  const shots = (current?.shots ?? []).filter(shot => (period === 'all' || String(shot.period) === period) && (outcome === 'all' || shot.made === (outcome === 'made')) && (points === 'all' || String(shot.points) === points))
  const located = shots.filter(shot => shot.halfCourt), made = shots.filter(shot => shot.made).length
  const detail = shots.find(shot => shot.order === selected)
  const bins = new Map<string, { x: number; y: number; count: number; made: number }>()
  for (const shot of located) { const x = Math.min(45, Math.floor(shot.x! / 5) * 5), y = Math.floor((shot.y! + 5.25) / 5) * 5, key = `${x}:${y}`; const bin = bins.get(key) ?? { x, y, count: 0, made: 0 }; bin.count++; bin.made += Number(shot.made); bins.set(key, bin) }
  const maximum = Math.max(1, ...[...bins.values()].map(bin => bin.count))
  if (!games.length) return <p className={styles.toolNote}>Shot locations are available for completed games from the 2025 season onward.</p>
  return <section className={styles.shotResearch} aria-label={`${player.first_name} ${player.last_name} interactive shot chart`}>
    <div className={styles.sectionHeading}><h3>Shot locations</h3><span>Actual field-goal attempts</span></div>
    <div className={styles.toolControls}><select aria-label="Shot chart game" value={gameId} onChange={event => { setGameId(Number(event.target.value)); setSelected(null); setError(''); setPeriod('all') }}>{games.map(game => <option key={game.id} value={game.id}>{game.date.slice(0, 10)} · {player.logs.find(log => log.game.id === game.id)?.team.id === game.home_team_id ? 'Home' : 'Away'}</option>)}</select><select aria-label="Shot period" value={period} onChange={event => setPeriod(event.target.value)}><option value="all">All periods</option>{[...new Set([1,2,3,4,...(current?.shots.map(shot => shot.period) ?? [])])].sort((a, b) => a - b).map(value => <option key={value} value={value}>{value <= 4 ? `Quarter ${value}` : `Overtime ${value - 4}`}</option>)}</select><select aria-label="Shot result" value={outcome} onChange={event => setOutcome(event.target.value)}><option value="all">Made + missed</option><option value="made">Made</option><option value="missed">Missed</option></select><select aria-label="Shot value" value={points} onChange={event => setPoints(event.target.value)}><option value="all">Twos + threes</option><option value="2">Two-pointers</option><option value="3">Three-pointers</option></select><button aria-pressed={heat} onClick={() => setHeat(value => !value)}>{heat ? 'Heatmap' : 'Shot map'}</button></div>
    {error ? <p role="status" className={styles.toolNote}>{error} <button onClick={() => { setError(''); setRetry(value => value + 1) }}>Retry</button></p> : !current ? <p role="status" className={styles.toolNote}>Loading recorded attempts…</p> : <>
      <div className={styles.shotSummary}><strong>{made}/{shots.length}<small>FIELD GOALS</small></strong><strong>{shots.length ? `${Math.round(made / shots.length * 100)}%` : '—'}<small>SHOOTING</small></strong><strong>{located.length}<small>LOCATED</small></strong></div>
      <svg viewBox="0 0 50 47" className={styles.shotMap} role="group" aria-label="Half court. Green dots are makes; orange dots are misses. Select a shot for details.">
        <rect x=".25" y=".25" width="49.5" height="46.5" rx=".5" fill="#101c25" stroke="#52636b" strokeWidth=".2"/>
        {heat && [...bins.values()].map(bin => <rect key={`${bin.x}:${bin.y}`} x={bin.x} y={bin.y} width="5" height={Math.min(5, 47 - bin.y)} fill="#b4ff4d" opacity={.1 + bin.count / maximum * .6}><title>{bin.count} attempts · {bin.made} made in this five-foot zone</title></rect>)}
        <g fill="none" stroke="#677b80" strokeWidth=".18" pointerEvents="none"><path d="M17 0V19H33V0 M3 0V14.2A23.75 23.75 0 0 0 47 14.2V0"/><circle cx="25" cy="19" r="6"/><path d="M19 47A6 6 0 0 1 31 47 M21 4H29 M21 5.25A4 4 0 0 0 29 5.25"/><circle cx="25" cy="5.25" r=".75" stroke="#e1b983" strokeWidth=".3"/></g>
        {!heat && located.map(shot => <circle key={shot.order} cx={shot.x!} cy={shot.y! + 5.25} r={selected === shot.order ? '.8' : '.55'} fill={shot.made ? '#c4ff86' : '#e39876'} stroke={selected === shot.order ? '#fff' : '#101c25'} strokeWidth=".2" tabIndex={0} role="button" aria-label={`Period ${shot.period}, ${shot.clock}: ${shot.text}`} onClick={() => setSelected(shot.order)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(shot.order) } }}><title>{shot.text} · {shot.clock}</title></circle>)}
      </svg>
      <p className={styles.toolNote}>{shots.length - located.length > 0 && `${shots.length - located.length} attempts have missing locations or fall beyond half court. `}{current.coverageMatches ? 'Attempt count matches the final box score.' : `${current.shots.length} recorded attempts; final box score lists ${current.boxScoreAttempts ?? 'an unknown count'}.`}{current.stale && ' Showing the last captured play feed.'}</p>
      {detail && <p className={styles.shotDetail} role="status">Q{detail.period} · {detail.clock}<strong>{detail.text}</strong></p>}
      <div className={styles.shotList}>{shots.map(shot => <button key={shot.order} aria-pressed={selected === shot.order} onClick={() => setSelected(shot.order)}><span className={shot.made ? styles.hit : styles.miss}>{shot.made ? '●' : '○'}</span><small>{shot.period > 4 ? `OT${shot.period - 4}` : `Q${shot.period}`} · {shot.clock}</small><span>{shot.text}{!shot.halfCourt && <small>Location unavailable / beyond half court</small>}</span></button>)}</div>
    </>}
  </section>
}
