'use client'
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  fetchWatchlist, addWatchlistItem, removeWatchlistItem, removeWatchlistItems, postWatchlistItemToFeed, postBetToFeed,
  type WatchlistItem, type NewWatchlistItem,
} from '@/lib/watchlist'
import { createClient } from '@/lib/supabase/client'

type WatchlistCtx = {
  items: WatchlistItem[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  add: (item: NewWatchlistItem) => Promise<WatchlistItem>
  remove: (id: string) => Promise<void>
  removeMany: (ids: string[]) => Promise<void>
  postToFeed: (item: WatchlistItem, opts?: { content?: string; isPremium?: boolean }) => Promise<{ postId: string; pickId: string }>
  postBet: (legs: WatchlistItem[], opts?: { content?: string; isPremium?: boolean; wagerAmount?: number | null }) => Promise<{ postId: string; pickIds: string[] }>
  isSaved: (mlbId: number | null, propKey: string, book: string | null) => boolean
  pendingCount: number
  signedIn: boolean
}

const Ctx = createContext<WatchlistCtx | null>(null)

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!user) { setItems([]); setLoading(false); return }
    setLoading(true)
    try {
      const rows = await fetchWatchlist(user.id)
      // Drop anything from a prior day in the VIEWER's own local timezone —
      // not the server's, and not a fixed cutoff. A guy you watchlisted or
      // posted yesterday shouldn't still be cluttering the list once it's a
      // new day for you, even if it's still "today" in UTC. Keyed off
      // game_date (the game it was actually for) since that's the
      // meaningful "day" here, falling back to created_at if that's missing.
      const localToday = new Date().toLocaleDateString('en-CA')
      const isFromToday = (item: WatchlistItem) => {
        const d = item.game_date || item.created_at?.slice(0, 10)
        return !d || d >= localToday
      }
      // Legacy rows from before posting started removing items outright —
      // once something's posted it belongs in My Picks, not lingering here
      // greyed out, so sweep any leftover 'posted' rows on load instead of
      // making every affected user find and click Remove on each one.
      const stalePosted = rows.filter(i => i.status === 'posted')
      if (stalePosted.length > 0) {
        const supabase = createClient()
        supabase.from('watchlist_items').delete().in('id', stalePosted.map(i => i.id))
          .then(({ error }) => { if (error) console.error('[watchlist] failed to sweep stale posted items', error) })
      }
      setItems(rows.filter(isFromToday).filter(i => i.status !== 'posted'))
      setError(null)
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { refresh() }, [refresh])

  const add = useCallback(async (item: NewWatchlistItem) => {
    if (!user) throw new Error('Sign in to add to your watchlist')
    const created = await addWatchlistItem(user.id, item)
    setItems(prev => [created, ...prev])
    return created
  }, [user])

  const remove = useCallback(async (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
    try {
      await removeWatchlistItem(id)
    } catch (e) {
      refresh()
      throw e
    }
  }, [refresh])

  const removeMany = useCallback(async (ids: string[]) => {
    if (!ids.length) return
    const idSet = new Set(ids)
    setItems(prev => prev.filter(i => !idSet.has(i.id)))
    try {
      await removeWatchlistItems(ids)
    } catch (e) {
      refresh()
      throw e
    }
  }, [refresh])

  const postToFeed = useCallback(async (item: WatchlistItem, opts?: { content?: string; isPremium?: boolean }) => {
    if (!user) throw new Error('Sign in to post')
    // Posting sends it to My Picks but deliberately leaves the watchlist
    // item itself untouched, so it keeps showing here for further plays.
    return await postWatchlistItemToFeed(user.id, item, opts)
  }, [user])

  const postBet = useCallback(async (legs: WatchlistItem[], opts?: { content?: string; isPremium?: boolean; wagerAmount?: number | null }) => {
    if (!user) throw new Error('Sign in to post')
    // Same as postToFeed — posting doesn't remove the legs from the watchlist.
    return await postBetToFeed(user.id, legs, opts)
  }, [user])

  const isSaved = useCallback((mlbId: number | null, propKey: string, book: string | null) => {
    return items.some(i => i.status === 'pending' && i.mlb_id === mlbId && i.prop_key === propKey && i.book === book)
  }, [items])

  const pendingCount = items.filter(i => i.status === 'pending').length

  return (
    <Ctx.Provider value={{ items, loading, error, refresh, add, remove, removeMany, postToFeed, postBet, isSaved, pendingCount, signedIn: !!user }}>
      {children}
    </Ctx.Provider>
  )
}

export function useWatchlist(): WatchlistCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useWatchlist must be used within a WatchlistProvider')
  return ctx
}
