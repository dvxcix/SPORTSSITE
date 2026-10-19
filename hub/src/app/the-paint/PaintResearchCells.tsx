'use client'
import { TeamLogo } from './PaintVisuals'
import type { PaintGame } from '@/lib/nbaPaint'
import polish from './research-polish.module.css'

export function compareResearch(a: number | string | null | undefined, b: number | string | null | undefined, ascending: boolean) {
  const unknownA = a == null || typeof a === 'number' && !Number.isFinite(a)
  const unknownB = b == null || typeof b === 'number' && !Number.isFinite(b)
  if (unknownA || unknownB) return unknownA ? unknownB ? 0 : 1 : -1
  return (typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b) : Number(a) - Number(b)) * (ascending ? 1 : -1)
}
export function PaintScoreCell({ score }: { score: number | null | undefined }) {
  return <span className={polish.score} data-level={score == null ? 'none' : score >= 65 ? 'high' : score >= 45 ? 'mid' : 'low'} aria-label={score == null ? 'SlipSurge Score unavailable' : `SlipSurge Score ${score} out of 100`}>{score ?? '—'}</span>
}
export function PaintMmCell({ mm }: { mm: number | null | undefined }) {
  return <span className={polish.mm} data-direction={mm == null || mm === 0 ? 'flat' : mm > 0 ? 'positive' : 'negative'} aria-label={mm == null ? 'MM unavailable' : `MM ${mm > 0 ? 'plus ' : ''}${mm}`}>{mm == null ? '—' : `${mm > 0 ? '+' : ''}${mm}`}</span>
}
export function PaintHitCell({ rate, wins, games, pushes }: { rate: number | null; wins: number; games: number; pushes: number }) {
  return <span className={polish.heat} data-level={rate == null ? 'none' : rate >= 70 ? 'high' : rate >= 50 ? 'mid' : 'low'}><b>{rate == null ? '—' : `${Math.round(rate)}%`}</b><small>{wins}/{games - pushes}{pushes ? ` · ${pushes} push${pushes === 1 ? '' : 'es'}` : ''}</small></span>
}
export function PaintMatchupIcons({ game }: { game: PaintGame }) {
  return <span className={polish.matchup} aria-label={`${game.visitor_team.full_name} at ${game.home_team.full_name}`}><TeamLogo abbr={game.visitor_team.abbreviation} size={20}/><span aria-hidden="true">·</span><TeamLogo abbr={game.home_team.abbreviation} size={20}/></span>
}
