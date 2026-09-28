'use client'
import { useRef, useState } from 'react'
import { Star, Send } from 'lucide-react'
import { useWatchlist } from '@/context/WatchlistContext'
import { nflWatchlistSelection } from '@/lib/nflWatchlist'
import type { NflOddsPlayer, NflPlayerMarket, NflMarketOffer } from '@/lib/nflOddsTypes'

export function NflPropActions({ player, market, offer, side, game }: {
  player: NflOddsPlayer; market: NflPlayerMarket; offer: NflMarketOffer; side: 'over' | 'under'; game: { id: string; gameday: string }
}) {
  const wl = useWatchlist()
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [error, setError] = useState('')
  const selection = nflWatchlistSelection(player, market, offer, side, game)
  const existing = wl.items.find(item => item.status === 'pending' && item.sport.toLowerCase() === 'nfl' && item.game_pk === game.id &&
    item.nfl_selection?.player_id === selection.nfl_selection?.player_id && item.prop_key === selection.prop_key && item.book === offer.vendor)
  async function act(post: boolean) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      if (wl.signedIn === false) throw new Error('Sign in to save and post picks.')
      if (existing && !post) await wl.remove(existing.id)
      else if (!existing) await wl.add(selection)
      if (post) window.dispatchEvent(new Event('ss:open-watchlist'))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save. Please try again.') }
    finally { lock.current = false; setBusy(false) }
  }
  return <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
    <button type="button" disabled={busy} title={existing ? 'Remove from Watchlist' : 'Save to Watchlist'} aria-pressed={!!existing} aria-label={`${existing ? 'Remove' : 'Save'} ${player.name} ${selection.prop_label} ${offer.vendor}`} onClick={event => { event.stopPropagation(); void act(false) }} style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', color: existing ? '#b4ff4d' : undefined }}>
      <Star size={16} fill={existing ? 'currentColor' : 'none'} />
    </button>
    <button type="button" disabled={busy} title="Review and Post Pick" aria-label={`Review ${player.name} ${selection.prop_label} for posting`} onClick={event => { event.stopPropagation(); void act(true) }} style={{ width: 44, height: 44, display: 'grid', placeItems: 'center' }}><Send size={16} /></button>
    {error ? <small role="alert">{error}</small> : null}
  </div>
}
