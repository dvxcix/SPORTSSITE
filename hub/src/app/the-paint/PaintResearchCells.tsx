'use client'
import { TeamLogo } from './PaintVisuals'
import { MechanicsScoreRing } from '@/components/ui/MechanicsScoreRing'
import Image from 'next/image'
import type { PaintGame } from '@/lib/nbaPaint'
import { nbaMmDescription } from '@/lib/nbaMarketMetrics'
import polish from './research-polish.module.css'
import { PaintHeatCell } from './PaintHeatCell'
import dials from './research-dials.module.css'

export function compareResearch(a: number | string | null | undefined, b: number | string | null | undefined, ascending: boolean) {
  const unknownA = a == null || typeof a === 'number' && !Number.isFinite(a)
  const unknownB = b == null || typeof b === 'number' && !Number.isFinite(b)
  if (unknownA || unknownB) return unknownA ? unknownB ? 0 : 1 : -1
  return (typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b) : Number(a) - Number(b)) * (ascending ? 1 : -1)
}
export function PaintScoreCell({ score }: { score: number | null | undefined }) {
  if (score == null || !Number.isFinite(score)) return <span className={dials.scoreUnavailable} aria-label="SlipSurge Score unavailable"><strong>—</strong><small><Image src="/logo.png" alt="" width={7} height={7} aria-hidden="true"/><em>SCORE</em></small></span>
  return <MechanicsScoreRing score={score} label="SlipSurge Score" size="small" />
}
export function PaintMmCell({ mm }: { mm: number | null | undefined }) {
  const description = mm == null ? nbaMmDescription() : mm === 0 ? 'Market and production rankings agree; no rank mismatch.' : mm > 0 ? 'Production ranks ahead of the market.' : 'The market ranks ahead of production.'
  return <span className={polish.mm} data-direction={mm == null || mm === 0 ? 'flat' : mm > 0 ? 'positive' : 'negative'} aria-label={mm == null ? `MM unavailable. ${description}` : `MM ${mm > 0 ? 'plus ' : ''}${mm}. ${description}`}>{mm == null ? '—' : `${mm > 0 ? '+' : ''}${mm}`}</span>
}
export function PaintHitCell({ rate, wins, games, pushes }: { rate: number | null; wins: number; games: number; pushes: number }) {
  return <PaintHeatCell value={rate} heat={rate} tone="performance" label="Last 10 hit rate"><b>{rate == null ? '—' : `${Math.round(rate)}%`}</b><small>{wins}/{games - pushes}{pushes ? ` · ${pushes} push${pushes === 1 ? '' : 'es'}` : ''}</small></PaintHeatCell>
}
export function PaintMatchupIcons({ game }: { game: PaintGame }) {
  return <span className={polish.matchup} aria-label={`${game.visitor_team.full_name} at ${game.home_team.full_name}`}><TeamLogo abbr={game.visitor_team.abbreviation} size={20}/><span aria-hidden="true">·</span><TeamLogo abbr={game.home_team.abbreviation} size={20}/></span>
}
