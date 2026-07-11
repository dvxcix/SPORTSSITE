'use client'
import { useState } from 'react'
import { X } from 'lucide-react'
import { BookLogo } from '@/components/BookLogo'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { getTeamLogoUrl } from '@/lib/mlbTeamColors'
import { combineOdds, calcPayout, formatOdds, fmtUsd } from '@/lib/parlayCalc'
import { type WatchlistItem } from '@/lib/watchlist'
import { useWatchlist } from '@/context/WatchlistContext'

// Posts one or more watchlist legs as a bet — a straight bet for one leg, a
// parlay for 2+. Every leg must share a book by the time this opens (the
// caller is responsible for enforcing that before letting the user get here).
export function PostBetModal({ legs, onClose, onPosted }: { legs: WatchlistItem[]; onClose: () => void; onPosted?: () => void }) {
  const wl = useWatchlist()
  const [wager, setWager] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')

  const isParlay = legs.length > 1
  const oddsList = legs.map(l => l.odds).filter((o): o is number => o != null)
  const combined = oddsList.length === legs.length ? (isParlay ? combineOdds(oddsList) : oddsList[0]) : null
  const wagerNum = parseFloat(wager)
  const hasWager = !isNaN(wagerNum) && wagerNum > 0
  const payout = combined != null && hasWager ? calcPayout(wagerNum, combined) : null

  async function submit() {
    setPosting(true); setError('')
    try {
      await wl.postBet(legs, { wagerAmount: hasWager ? wagerNum : null })
      onPosted?.()
      onClose()
    } catch (e: any) {
      setError(e.message || 'Failed to post')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(420px, 100%)', maxHeight: '85vh', overflowY: 'auto', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)' }}>{isParlay ? `${legs.length}-Leg Parlay` : 'Post Pick'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {legs.map(l => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 8 }}>
              <PlayerAvatar headshot={l.headshot_url} teamLogo={getTeamLogoUrl(l.team)} teamAbbr={l.team} name={l.player_name} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{l.player_name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{l.prop_label}</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'monospace' }}>{formatOdds(l.odds)}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 8, marginBottom: 12 }}>
          {legs[0].book && <BookLogo vendor={legs[0].book} size={16} />}
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{isParlay ? 'Combined odds' : 'Odds'}</span>
          <span style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 900, color: 'var(--accent)', fontFamily: 'monospace' }}>{combined != null ? formatOdds(combined) : '—'}</span>
        </div>

        <label style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700 }}>Wager (optional)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 10 }}>
          <span style={{ fontSize: 14, color: 'var(--text-3)' }}>$</span>
          <input
            type="number" min="0" step="1" value={wager}
            onChange={e => setWager(e.target.value)}
            placeholder="0.00"
            style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '8px 10px', color: 'var(--text-1)', fontSize: 14, outline: 'none' }}
          />
        </div>

        {payout && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
            <span>To win <strong style={{ color: 'var(--green)' }}>{fmtUsd(payout.profit)}</strong></span>
            <span>Payout <strong style={{ color: 'var(--text-1)' }}>{fmtUsd(payout.payout)}</strong></span>
          </div>
        )}

        {error && <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{error}</p>}

        <button
          onClick={submit}
          disabled={posting || combined == null}
          style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--accent-fg)', fontWeight: 800, fontSize: 13, cursor: posting ? 'default' : 'pointer', opacity: posting || combined == null ? 0.7 : 1 }}
        >
          {posting ? 'Posting…' : isParlay ? 'Post Parlay' : 'Post Pick'}
        </button>
      </div>
    </div>
  )
}
