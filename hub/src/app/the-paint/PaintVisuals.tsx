'use client'
import { useState } from 'react'
import { Shield, UserRound } from 'lucide-react'
import { SafeImage } from '@/components/ui/SafeImage'
import { nbaBinary, gradeNbaValue, nbaValue, type PaintPlayer, type PaintStat } from '@/lib/nbaPaint'
import { nbaTeamGradient } from '@/lib/nbaTeamColors'
import { nbaPortraitFallback } from '@/lib/nbaPlayerPortraits'
import { useNbaMatrixMatches } from '@/components/nba/NbaMatrixContext'
import styles from './paint.module.css'

export function CourtMark() { return <svg viewBox="0 0 36 36" fill="none" aria-hidden="true"><rect x="4" y="4" width="28" height="28" rx="3" stroke="currentColor" strokeWidth="1.5"/><path d="M13 4v12h10V4M4 14c0 10 28 10 28 0M4 27h28" stroke="currentColor" strokeWidth="1.5"/><circle cx="18" cy="10" r="2" fill="currentColor"/></svg> }
const code = (abbr: string) => ({ GSW: 'gs', NOP: 'no', NYK: 'ny', SAS: 'sa', UTA: 'utah' }[abbr] ?? abbr.toLowerCase())
export function TeamLogo({ abbr, size = 28 }: { abbr: string; size?: number }) { return <SafeImage src={`https://a.espncdn.com/i/teamlogos/nba/500/${code(abbr)}.png`} alt="" width={size} height={size} className={styles.teamLogo} fallback={<span className={styles.teamFallback} style={{ width: size, height: size }}><Shield size={Math.max(10,size*.65)} aria-hidden="true"/></span>} /> }
export function PlayerAvatar({ player, large = false }: { player: Pick<PaintPlayer,'headshot'|'team'> & Partial<Pick<PaintPlayer,'id'>>; large?: boolean }) {
  const matches = useNbaMatrixMatches(player.id ?? 0)
  const portrait = nbaPortraitFallback(player.id)
  const missing = <span className={styles.initials}><UserRound size={large ? 85 : 27} aria-hidden="true"/></span>
  const fallback = player.headshot && portrait && portrait !== player.headshot ? <SafeImage src={portrait} alt="" width={large ? 180 : 46} height={large ? 148 : 46} fallback={missing}/> : missing
  return <span className={large ? styles.portrait : styles.avatar} style={{ background: nbaTeamGradient(player.team.abbreviation) }} role={matches.length ? 'img' : undefined} aria-label={matches.length ? `Matrix matches: ${matches.map(match=>match.name).join(', ')}` : undefined}>
    <span className={styles.avatarFrame}><SafeImage src={player.headshot || portrait} alt="" width={large ? 180 : 46} height={large ? 148 : 46} fallback={fallback}/></span>
    {!large && <span className={styles.avatarTeam}><TeamLogo abbr={player.team.abbreviation} size={15}/></span>}
    {matches.length>0&&<span className={styles.avatarMatrix} aria-hidden="true" style={{borderColor:matches[0].color}}/>}
  </span>
}
export const number = (value: number | null | undefined, digits = 1) => value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits)
export const marketNumber = (value:number|null|undefined,market:string) => nbaBinary(market) && value!=null ? number(value*100)+'%' : number(value)
export function TrendBars({ logs, market, line, side = 'over', milestone = false, tall = false }: { logs: PaintStat[]; market: string; line: number | null; side?: 'over' | 'under'; milestone?: boolean; tall?: boolean }) {
  const values = [...logs].reverse().map(log => ({ log, value: nbaValue(log, market) }))
  const max = Math.max(1, ...values.map(v => v.value ?? 0), line ?? 0) * 1.15
  if (tall) return <TrendChart values={values} max={max} line={line} side={side} milestone={milestone}/>
  return <div className={tall ? styles.chart : styles.spark} role="img" aria-label={values.length ? `${values.length} games, oldest to newest: ${values.map(v => v.value ?? 'unavailable').join(', ')}${line != null ? `; reference line ${line}` : ''}` : 'No game sample available'}>
    {line != null && <span className={styles.chartLine} style={{ bottom: `${line / max * 100}%` }}>{tall ? line : ''}</span>}
    {values.map(({ log, value }) => <span key={log.id} className={line != null && value != null && gradeNbaValue(value,line,milestone?'milestone':side)==='win' ? styles.barHit : styles.bar} style={{ height: `${Math.max(2, (value ?? 0) / max * 100)}%` }} aria-label={`${log.game.date}: ${value ?? 'No data'}`}>{tall && <b>{value ?? '—'}</b>}</span>)}
    {!values.length && <small>—</small>}
  </div>
}
function TrendChart({ values, max, line, side, milestone }: {
  values: { log: PaintStat; value: number | null }[]; max: number; line: number | null; side: 'over' | 'under'; milestone: boolean
}) {
  const [active, setActive] = useState<number | null>(null)
  const [focus, setFocus] = useState(0)
  const focusIndex = Math.min(focus, Math.max(0, values.length - 1))
  const scale = Math.ceil(max)
  const selected = active == null ? null : values[active]
  const result = (value: number | null) => line == null || value == null ? null : gradeNbaValue(value, line, milestone ? 'milestone' : side)
  const describe = (value: number | null) => value == null ? 'Unavailable' : result(value) === 'win' ? 'Hit' : result(value) === 'push' ? 'Push' : result(value) === 'loss' ? 'Miss' : 'No reference line'
  return <figure className={styles.chartFigure} data-dense={values.length>10||undefined}>
    <div className={styles.chartFrame}><div className={styles.chartAxis} aria-hidden="true"><span>{number(scale,0)}</span><span>{number(scale/2,1)}</span><span>0</span></div>
    <div className={styles.chartViewport} role="region" aria-label="Game results chart, scroll for all games" tabIndex={0}><div className={styles.chart} role="group" aria-label="Game-by-game results" onPointerLeave={event => { if (event.pointerType === 'mouse' && !event.currentTarget.contains(document.activeElement)) setActive(null) }}>
      {line != null && <span className={styles.chartLine} style={{ bottom: (line / scale * 100)+'%' }} aria-hidden="true"/>}
      {values.map(({ log, value }, index) => <button type="button" key={log.id} data-chart-bar data-active={active === index || undefined} data-result={result(value) ?? 'unavailable'} data-known={value!=null} data-zero={value===0||undefined} tabIndex={index === focusIndex ? 0 : -1} aria-label={log.game.date+': '+(value ?? 'Unavailable')+' · '+describe(value)} onPointerEnter={() => setActive(index)} onFocus={() => { setActive(index); setFocus(index) }} onBlur={() => setActive(null)} onClick={() => setActive(index)} onKeyDown={event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return
        event.preventDefault()
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? values.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + values.length) % values.length
        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button[data-chart-bar]')[next]?.focus()
      }}>{value!=null&&<span className={styles.chartFill} style={{height:(value/scale*100)+'%'}}/>}<b className={styles.chartValue} style={{bottom:'calc('+((value??0)/scale*100)+'% + 5px)'}}>{value ?? '—'}</b></button>)}
      {!values.length && <small>No game sample</small>}
    </div></div></div>
    <figcaption className={styles.chartLegend}><span data-result="win">Hit</span><span data-result="loss">Miss</span><span data-result="push">Push</span><output aria-live="polite">{selected ? selected.log.game.date+' · '+(selected.value ?? 'Unavailable')+' · '+describe(selected.value) : values.length+' games'+(line == null ? ' · No reference line' : ' · Line '+line)}</output></figcaption>
  </figure>
}
export function ShotCourt({ stats }: { stats: Record<string, number | null> }) {
  const zones = [{ key: 'restricted_area', label: 'At rim', x: 150, y: 49 }, { key: 'in_the_paint_(non-ra)', label: 'Paint', x: 150, y: 100 }, { key: 'mid-range', label: 'Midrange', x: 150, y: 151 }, { key: 'left_corner_3', label: 'Left corner', x: 28, y: 81 }, { key: 'right_corner_3', label: 'Right corner', x: 272, y: 81 }, { key: 'above_the_break_3', label: 'Above break', x: 150, y: 214 }]
  return <div className={styles.shotCourt}><svg viewBox="0 0 300 250" role="img" aria-label="Shooting percentages by court zone. Each value is a season average, not a shot location."><rect x="1" y="1" width="298" height="248" rx="8" fill="var(--surface)" stroke="var(--chart-grid)"/><path d="M108 1v119h84V1M108 120a42 42 0 0 0 84 0M12 1v90a138 138 0 0 0 276 0V1M126 1v62h48V1M134 23h32M150 23v10" fill="none" stroke="var(--chart-grid)"/><circle cx="150" cy="38" r="6" fill="none" stroke="var(--accent)"/>{zones.map(z => { const value = stats[`${z.key}_fg_pct`]; const attempts = stats[`${z.key}_fga`] ?? 0; const known = value != null && attempts > 0; return <g key={z.key}><rect x={z.x - 25} y={z.y - 12} width="50" height="24" rx="6" fill={known ? `hsl(${Math.max(0, Math.min(110, value * 180))} 32% var(--heatmap-lightness))` : 'var(--surface-2)'}/><text x={z.x} y={z.y + 4} textAnchor="middle" fill="var(--heatmap-ink)" fontSize="12" fontWeight="650">{known ? `${Math.round(value * 100)}%` : '—'}</text></g> })}</svg><div>{zones.map(z => <span key={z.key}>{z.label}<b>{number(stats[`${z.key}_fga`])} FGA/G</b></span>)}</div></div>
}
