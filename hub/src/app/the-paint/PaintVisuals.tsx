'use client'
import { SafeImage } from '@/components/ui/SafeImage'
import { nbaValue, type PaintPlayer, type PaintStat } from '@/lib/nbaPaint'
import styles from './paint.module.css'

export function CourtMark() { return <svg viewBox="0 0 36 36" fill="none" aria-hidden="true"><rect x="4" y="4" width="28" height="28" rx="3" stroke="currentColor" strokeWidth="1.5"/><path d="M13 4v12h10V4M4 14c0 10 28 10 28 0M4 27h28" stroke="currentColor" strokeWidth="1.5"/><circle cx="18" cy="10" r="2" fill="currentColor"/></svg> }
const code = (abbr: string) => ({ GSW: 'gs', NOP: 'no', NYK: 'ny', SAS: 'sa', UTA: 'utah' }[abbr] ?? abbr.toLowerCase())
export function TeamLogo({ abbr, size = 28 }: { abbr: string; size?: number }) { return <SafeImage src={`https://a.espncdn.com/i/teamlogos/nba/500/${code(abbr)}.png`} alt="" width={size} height={size} className={styles.teamLogo} fallback={<span className={styles.teamFallback} style={{ width: size, height: size }}>{abbr}</span>} /> }
export function PlayerAvatar({ player, large = false }: { player: PaintPlayer; large?: boolean }) { return <span className={large ? styles.portrait : styles.avatar}><SafeImage src={player.headshot} alt="" width={large ? 190 : 62} height={large ? 138 : 46} fallback={<span className={styles.initials}>{player.first_name[0]}{player.last_name[0]}</span>}/>{!large && <span className={styles.avatarTeam}><TeamLogo abbr={player.team.abbreviation} size={15}/></span>}</span> }
export const number = (value: number | null | undefined, digits = 1) => value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits)
export function TrendBars({ logs, market, line, side = 'over', tall = false }: { logs: PaintStat[]; market: string; line: number | null; side?: 'over' | 'under'; tall?: boolean }) {
  const values = [...logs].reverse().map(log => ({ log, value: nbaValue(log, market) }))
  const max = Math.max(1, ...values.map(v => v.value ?? 0), line ?? 0) * 1.15
  return <div className={tall ? styles.chart : styles.spark} role="img" aria-label={values.length ? `${values.length} games, oldest to newest: ${values.map(v => v.value ?? 'unavailable').join(', ')}${line != null ? `; reference line ${line}` : ''}` : 'No game sample available'}>
    {line != null && <span className={styles.chartLine} style={{ bottom: `${line / max * 100}%` }}>{tall ? line : ''}</span>}
    {values.map(({ log, value }) => <span key={log.id} className={line != null && value != null && (side === 'over' ? value > line : value < line) ? styles.barHit : styles.bar} style={{ height: `${Math.max(2, (value ?? 0) / max * 100)}%` }} title={`${log.game.date}: ${value ?? 'No data'}`}>{tall && <b>{value ?? '—'}</b>}</span>)}
    {!values.length && <small>—</small>}
  </div>
}
export function ShotCourt({ stats }: { stats: Record<string, number | null> }) {
  const zones = [{ key: 'restricted_area', label: 'At rim', x: 150, y: 49 }, { key: 'in_the_paint_(non-ra)', label: 'Paint', x: 150, y: 100 }, { key: 'mid-range', label: 'Midrange', x: 150, y: 151 }, { key: 'left_corner_3', label: 'Left corner', x: 28, y: 81 }, { key: 'right_corner_3', label: 'Right corner', x: 272, y: 81 }, { key: 'above_the_break_3', label: 'Above break', x: 150, y: 214 }]
  return <div className={styles.shotCourt}><svg viewBox="0 0 300 250" role="img" aria-label="Shooting percentages by court zone. Each value is a season average, not a shot location."><rect x="1" y="1" width="298" height="248" rx="8" fill="#0c1118" stroke="#303945"/><path d="M108 1v119h84V1M108 120a42 42 0 0 0 84 0M12 1v90a138 138 0 0 0 276 0V1M126 1v62h48V1M134 23h32M150 23v10" fill="none" stroke="#3a4350"/><circle cx="150" cy="38" r="6" fill="none" stroke="#b4ff4d"/>{zones.map(z => { const value = stats[`${z.key}_fg_pct`]; const attempts = stats[`${z.key}_fga`] ?? 0; const known = value != null && attempts > 0; return <g key={z.key}><rect x={z.x - 25} y={z.y - 12} width="50" height="24" rx="6" fill={known ? `hsl(${Math.max(0, Math.min(110, value * 180))} 32% 24%)` : '#171e28'}/><text x={z.x} y={z.y + 4} textAnchor="middle" fill="#edf1f5" fontSize="11" fontWeight="650">{known ? `${Math.round(value * 100)}%` : '—'}</text></g> })}</svg><div>{zones.map(z => <span key={z.key}>{z.label}<b>{number(stats[`${z.key}_fga`])} FGA</b></span>)}</div></div>
}
