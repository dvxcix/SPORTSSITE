'use client'
import { useRef, useState } from 'react'
import { Star, ArrowUpRight } from 'lucide-react'
import { useWatchlist } from '@/context/WatchlistContext'
import { nbaOdds, nbaSelectionKey, PAINT_MARKETS, type PaintGame, type PaintPlayer, type PaintProp } from '@/lib/nbaPaint'
import styles from './paint.module.css'
export function PaintPickActions({ player, offer, side, game }: { player: PaintPlayer; offer: PaintProp; side: 'over' | 'under'; game: PaintGame }) {
  const watchlist = useWatchlist(); const lock = useRef(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const key = nbaSelectionKey(player.id, offer, side)
  const existing = watchlist.items.find(i => i.sport.toLowerCase() === 'nba' && i.game_pk === String(game.id) && i.prop_key === key && i.book === offer.vendor && i.status === 'pending')
  const odds = offer.market.type === 'milestone' ? offer.market.odds : side === 'over' ? offer.market.over_odds : offer.market.under_odds
  const starts = Date.parse(game.datetime ?? game.status); const closed = !Number.isFinite(starts) || !['scheduled', 'unknown', undefined].includes(game.status_state)
  const label = `${offer.market.type === 'milestone' ? `${offer.line_value}+` : `${side === 'over' ? 'Over' : 'Under'} ${offer.line_value}`} ${PAINT_MARKETS.find(m => m.key === offer.prop_type)?.label ?? offer.prop_type}`
  async function save() {
    if (lock.current || closed || odds == null) return
    if (starts <= Date.now()) { setError('Game already started.'); return }
    lock.current = true; setBusy(true); setError('')
    try { if (existing) await watchlist.remove(existing.id); else await watchlist.add({ sport: 'nba', game_pk: String(game.id), game_date: game.date, mlb_id: null, player_name: `${player.first_name} ${player.last_name}`, team: player.team.abbreviation, position: player.position, headshot_url: player.headshot, prop_key: key, prop_label: label, line: offer.line_value, book: offer.vendor, odds, odds_by_book: { [offer.vendor]: odds } }) }
    catch { setError('Could not save. Try again.') } finally { lock.current = false; setBusy(false) }
  }
  return <span className={styles.pickActions}><button type="button" aria-label={`${existing ? 'Remove' : 'Save'} ${player.first_name} ${player.last_name}, ${label}, ${offer.vendor}, ${nbaOdds(odds)}`} title={closed ? 'Game already started' : existing ? 'Remove saved pick' : 'Save pick'} aria-pressed={!!existing} disabled={busy || odds == null || closed} onClick={() => void save()} className={existing ? styles.saved : undefined}><Star size={16} fill={existing ? 'currentColor' : 'none'}/></button>{existing && <button type="button" aria-label="Review saved picks" onClick={() => window.dispatchEvent(new Event('ss:open-watchlist'))}><ArrowUpRight size={16}/></button>}{error && <small role="alert">{error}</small>}</span>
}
