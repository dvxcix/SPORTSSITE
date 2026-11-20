'use client'
import type { NbaOddsBoardPhaseCheck } from '@/lib/nbaOddsBoardPhase'
import { nbaModeHref } from '@/lib/nbaModeHref'
import { useNbaOddsMode } from '@/components/nba/NbaOddsModeContext'
import { useId, useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { nbaSeason, type PaintBoard } from '@/lib/nbaPaint'
import { number, PlayerAvatar, TeamLogo } from './PaintVisuals'
import { PaintGameSummary } from './PaintGameSummary'
import styles from './paint.module.css'
import detail from './PaintMatchup.module.css'

export function PaintMatchup({ board, refreshPrices = false, phaseCheck }: { board: PaintBoard; refreshPrices?: boolean; phaseCheck?: NbaOddsBoardPhaseCheck | null }) {
  const oddsMode = useNbaOddsMode()
  const [open, setOpen] = useState(false), id = useId()
  const teams = [board.game.visitor_team, board.game.home_team]
  return <div className={styles.matchupContext}><PaintGameSummary board={board} refreshPrices={refreshPrices} phaseCheck={phaseCheck} teamControl={<button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls={id} aria-label="Team matchup details">Teams<ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : undefined }}/></button>}/>{open && <div className={styles.matchupGrid} id={id}>{teams.map(team => { const stats = board.teamStats?.find(t => t.team.id === team.id)?.stats; const starters = board.players.filter(player => player.team.id === team.id && board.starters?.includes(player.id)); return <section key={team.id} aria-label={`${team.full_name} matchup`}><header><TeamLogo abbr={team.abbreviation} size={27}/><strong>{team.name}</strong><small>{nbaSeason(board.teamStatsSeason??board.sampleSeason)}</small></header><div>{[{ label: 'Pace', key: 'pace' }, { label: 'Off. rating', key: 'off_rating' }, { label: 'Def. rating', key: 'def_rating' }].map(m => <span key={m.key}><small>{m.label}</small><b>{number(stats?.[m.key])}</b></span>)}</div><footer className={detail.starters}><span className={detail.starterStatus}>{starters.length === 5 ? "Confirmed starters" : starters.length ? `${starters.length} confirmed ${starters.length === 1 ? "starter" : "starters"}` : "Lineup not confirmed"}</span>{starters.length > 0 && <ul className={detail.starterList} aria-label={`${team.full_name} confirmed starters`}>{starters.map(player => <li key={player.id}><Link className={detail.starterLink} href={nbaModeHref(`/nba/players/${player.id}?game=${board.game.id}`, oddsMode)} aria-label={`${player.first_name} ${player.last_name}, confirmed starter`}><PlayerAvatar player={player}/></Link></li>)}</ul>}</footer></section> })}</div>}</div>
}
