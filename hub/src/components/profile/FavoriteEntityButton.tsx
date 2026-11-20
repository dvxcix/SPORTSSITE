'use client'

import { useEffect, useState } from 'react'
import { Heart, Loader2 } from 'lucide-react'
import { favoritePlayerKey, resolveFavoriteTeam, type FavoritePlayer } from '@/lib/sportFavorites'

export function FavoriteEntityButton({ team, player, label }: { team?: string; player?: FavoritePlayer; label: string }) {
  const [selected, setSelected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const playerKey = player ? favoritePlayerKey(player) : null
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/account/favorites', { signal: controller.signal, cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('Sign in to manage favorites.')
      return response.json()
    }).then(data => { if (!controller.signal.aborted) setSelected(team ? data.teams.some((key: string) => resolveFavoriteTeam(key, data.catalog, data.sports)?.key === team) : data.players.some((item: FavoritePlayer) => favoritePlayerKey(item) === playerKey)) })
      .catch(() => { if (!controller.signal.aborted) setError('Favorites are unavailable.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [team, playerKey])
  async function toggle() {
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/account/favorites', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: selected ? 'remove' : 'add', ...(team ? { team } : { player }) }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Favorites could not be saved.')
      setSelected(team ? !selected : data.players.some((item: FavoritePlayer) => favoritePlayerKey(item) === playerKey))
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Favorites could not be saved.') } finally { setLoading(false) }
  }
  return <div><button type="button" disabled={loading} aria-pressed={selected} aria-label={`${selected ? 'Remove' : 'Add'} ${label} ${selected ? 'from' : 'to'} favorites`} onClick={toggle} className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition disabled:opacity-50 ${selected ? 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]' : 'border-[rgba(var(--line-rgb),0.15)] bg-[rgba(var(--contrast-rgb),0.05)] text-[var(--text-2)] hover:bg-[rgba(var(--contrast-rgb),0.1)]'}`}>{loading ? <Loader2 size={15} className="animate-spin"/> : <Heart size={15} fill={selected ? 'currentColor' : 'none'}/>} {selected ? 'Favorited' : 'Favorite'}</button>{error && <p role="alert" className="mt-2 max-w-xs text-xs text-[var(--text-2)]">{error}</p>}</div>
}
