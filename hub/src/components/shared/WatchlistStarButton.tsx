'use client'
import { useState } from 'react'
import { useWatchlist } from '@/context/WatchlistContext'
import { PROP_META } from '@/lib/watchlist'
import { mlbHeadshot } from '@/lib/mlb-api'

// A star next to a batter's name/link, toggling one specific prop (defaults
// to FanDuel's anytime-HR line, "sa") in/out of the watchlist — same
// add/remove logic Dugout's OddsCell already uses on its odds cells, just
// surfaced as its own explicit control next to the player rather than
// requiring a click on a specific odds column out in the table. Self-hides
// (renders nothing) for a signed-out visitor or when there's no odds to
// actually save.
export function WatchlistStarButton({
  mlbId, name, team, position, bats, gameInfo, odds, oddsByBook, propKey = 'sa', book = 'fanduel', size = 13,
}: {
  mlbId: number | null
  name: string
  team?: string | null
  position?: string | null
  bats?: string | null
  gameInfo: { sport: string; game_pk: string | null; game_date: string | null }
  odds: number | null
  oddsByBook?: Record<string, number>
  propKey?: string
  book?: string
  size?: number
}) {
  const wl = useWatchlist()
  const [busy, setBusy] = useState(false)

  if (!wl.signedIn || odds == null) return null

  const saved = wl.isSaved(mlbId, propKey, book)
  const meta = PROP_META[propKey]

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try {
      if (saved) {
        const existing = wl.items.find(i => i.status === 'pending' && i.mlb_id === mlbId && i.prop_key === propKey && i.book === book)
        if (existing) await wl.remove(existing.id)
        return
      }
      await wl.add({
        sport: gameInfo.sport,
        game_pk: gameInfo.game_pk,
        game_date: gameInfo.game_date,
        mlb_id: mlbId,
        player_name: name,
        team: team ?? null,
        position: position ?? null,
        bats: bats ?? null,
        headshot_url: mlbId ? mlbHeadshot(mlbId) : null,
        prop_key: propKey,
        prop_label: meta?.label ?? propKey,
        book,
        odds,
        odds_by_book: oddsByBook ?? { [book]: odds },
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      title={saved ? 'Saved to watchlist — click to remove' : `Add ${meta?.label ?? propKey} @ ${book} to watchlist`}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'none', border: 'none', padding: 0, flexShrink: 0,
        cursor: busy ? 'default' : 'pointer',
        color: saved ? '#eab308' : 'var(--text-3)',
        fontSize: size, lineHeight: 1,
      }}
    >
      {saved ? '★' : '☆'}
    </button>
  )
}
