'use client'
import { nbaModeHref } from '@/lib/nbaModeHref'
import { useNbaOddsMode } from '@/components/nba/NbaOddsModeContext'
import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Activity } from 'lucide-react'
import { BookLogo } from '@/components/BookLogo'
import { nbaSeason, type PaintBoard } from '@/lib/nbaPaint'
import { number, PlayerAvatar, TeamLogo } from './PaintVisuals'
import { PaintGamePrice } from './PaintPrice'
import styles from './paint.module.css'
import detail from './PaintMatchup.module.css'

export function PaintMatchup({ board }: { board: PaintBoard }) {
  const oddsMode = useNbaOddsMode()
  const [open, setOpen] = useState(false)
  const quote = board.gameOdds?.find(o => o.vendor === 'draftkings') ?? board.gameOdds?.[0]
  const teams = [board.game.visitor_team, board.game.home_team]
  return <div className={styles.matchupContext}><div className={styles.gameLine}><span><TeamLogo abbr={board.game.visitor_team.abbreviation} size={18}/><b>{quote?.spread_away_value == null ? '—' : Number(quote.spread_away_value) > 0 ? `+${quote.spread_away_value}` : quote.spread_away_value}</b>{quote&&<PaintGamePrice quote={quote} field="spread_away" compact/>}</span><span><TeamLogo abbr={board.game.home_team.abbreviation} size={18}/><b>{quote?.spread_home_value == null ? '—' : Number(quote.spread_home_value) > 0 ? `+${quote.spread_home_value}` : quote.spread_home_value}</b>{quote&&<PaintGamePrice quote={quote} field="spread_home" compact/>}</span><span><small>TOTAL</small><b>{quote?.total_value ?? '—'}</b></span>{quote && <span className={styles.quoteBook} aria-label={`${quote.vendor} · ${quote.updated_at}`}><BookLogo vendor={quote.vendor} size={15}/></span>}<button onClick={() => setOpen(v => !v)} aria-expanded={open}><Activity size={14}/><span>Matchup</span><ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : undefined }}/></button></div>{open && <div className={styles.matchupGrid}>{teams.map(team => { const stats = board.teamStats?.find(t => t.team.id === team.id)?.stats; const starters = board.players.filter(player => player.team.id === team.id && board.starters?.includes(player.id)); return <section key={team.id} aria-label={`${team.full_name} matchup`}><header><TeamLogo abbr={team.abbreviation} size={27}/><strong>{team.name}</strong><small>{nbaSeason(board.teamStatsSeason??board.sampleSeason)}</small></header><div>{[{ label: 'Pace', key: 'pace' }, { label: 'Off. rating', key: 'off_rating' }, { label: 'Def. rating', key: 'def_rating' }].map(m => <span key={m.key}><small>{m.label}</small><b>{number(stats?.[m.key])}</b></span>)}</div><footer className={detail.starters}><span className={detail.starterStatus}>{starters.length === 5 ? "Confirmed starters" : starters.length ? `${starters.length} confirmed ${starters.length === 1 ? "starter" : "starters"}` : "Starters pending"}</span>{starters.length > 0 && <ul className={detail.starterList} aria-label={`${team.full_name} confirmed starters`}>{starters.map(player => <li key={player.id}><Link className={detail.starterLink} href={nbaModeHref(`/nba/players/${player.id}?game=${board.game.id}`, oddsMode)} aria-label={`${player.first_name} ${player.last_name}, confirmed starter`}><PlayerAvatar player={player}/></Link></li>)}</ul>}</footer></section> })}</div>}</div>
}
