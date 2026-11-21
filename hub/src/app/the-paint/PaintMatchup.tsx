'use client'
import type { NbaOddsBoardPhaseCheck } from '@/lib/nbaOddsBoardPhase'
import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { nbaSeason, type PaintBoard } from '@/lib/nbaPaint'
import { number, TeamLogo } from './PaintVisuals'
import { PaintGameSummary } from './PaintGameSummary'
import styles from './paint.module.css'
import { PaintLineupTeam, usePaintLineups } from './PaintLineups'

export function PaintMatchup({ board, refreshPrices = false, phaseCheck }: { board: PaintBoard; refreshPrices?: boolean; phaseCheck?: NbaOddsBoardPhaseCheck | null }) {
  const [open, setOpen] = useState(false), id = useId()
  const teams = [board.game.visitor_team, board.game.home_team]
  const lineups = usePaintLineups(board,open)
  return <div className={styles.matchupContext}><PaintGameSummary board={board} refreshPrices={refreshPrices} phaseCheck={phaseCheck} teamControl={<button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls={id} aria-label="Team matchup details">Teams<ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : undefined }}/></button>}/>{open && <div className={styles.matchupGrid} id={id}>{teams.map(team => { const stats = board.teamStats?.find(t => t.team.id === team.id)?.stats; return <section key={team.id} aria-label={`${team.full_name} matchup`}><header><TeamLogo abbr={team.abbreviation} size={27}/><strong>{team.name}</strong><small>{nbaSeason(board.teamStatsSeason??board.sampleSeason)}</small></header><div>{[{ label: 'Pace', key: 'pace' }, { label: 'Off. rating', key: 'off_rating' }, { label: 'Def. rating', key: 'def_rating' }].map(m => <span key={m.key}><small>{m.label}</small><b>{number(stats?.[m.key])}</b></span>)}</div><PaintLineupTeam board={board} team={team} lineup={lineups.teams.find(row=>row.teamId===team.id)} loading={lineups.loading} failed={lineups.failed} retry={lineups.retry}/></section> })}</div>}</div>
}
