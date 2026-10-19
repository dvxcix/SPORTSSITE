'use client'
import { BookLogo } from '@/components/BookLogo'
import { nbaPrice, nbaTarget, nbaOdds, nbaReference, type PaintBoard, type PaintMarket, type PaintPlayer } from '@/lib/nbaPaint'
import type { PaintRanks } from '@/lib/nbaMarketMetrics'
import { PaintPickActions } from './PaintPickActions'
import { PlayerAvatar } from './PaintVisuals'
import styles from './paint.module.css'

export function PaintOddsBoard({ players, board, market, side, vendors, ranks, open }: { players: PaintPlayer[]; board: PaintBoard; market: PaintMarket; side: 'over' | 'under'; vendors: string[]; ranks: Map<number, PaintRanks>; open: (id: number) => void }) {
  return <div className={styles.oddsScroll}><table className={styles.oddsTable}><caption className={styles.srOnly}>NBA sportsbook comparison. Each book cell shows its own line and price.</caption><thead><tr><th>Player</th><th title="Sportsbook rank minus stat rank; positive means stronger observed production than market rank.">MM</th>{vendors.map(v => <th key={v}><BookLogo vendor={v} size={23}/><span>{v}</span></th>)}</tr></thead><tbody>{players.map(player => { const rank = ranks.get(player.id); return <tr key={player.id}><th><button className={styles.playerButton} onClick={() => open(player.id)}><PlayerAvatar player={player}/><span><strong>{player.first_name} {player.last_name}</strong><small>{player.team.name}</small></span></button></th><td><b className={rank?.mm == null ? styles.muted : rank.mm > 0 ? styles.hit : rank.mm < 0 ? styles.miss : styles.muted}>{rank ? `${rank.mm > 0 ? '+' : ''}${rank.mm}` : '—'}</b></td>{vendors.map(v => { const offer = nbaReference(player.props, market, v, side); return <td key={v}>{offer ? <div className={styles.bookQuote}><button onClick={() => open(player.id)} title="Open all lines and ladders"><small>{nbaTarget(offer, side)}</small><b>{nbaOdds(nbaPrice(offer, side))}</b></button><PaintPickActions player={player} offer={offer} side={side} game={board.game}/></div> : <span className={styles.muted}>—</span>}</td> })}</tr> })}</tbody></table></div>
}
