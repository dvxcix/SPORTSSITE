'use client'
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  fetchWatchlist, addWatchlistItem, removeWatchlistItem, postWatchlistItemToFeed, postBetToFeed,
  type WatchlistItem, type NewWatchlistItem,
} from '@/lib/watchlist'

type WatchlistCtx = {
  items: WatchlistItem[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  add: (item: NewWatchlistItem) => Promise<WatchlistItem>
  remove: (id: string) => Promise<void>
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
      setItems(rows.filter(isFromToday))
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

  const postToFeed = useCallback(async (item: WatchlistItem, opts?: { content?: string; isPremium?: boolean }) => {
    if (!user) throw new Error('Sign in to post')
    const result = await postWatchlistItemToFeed(user.id, item, opts)
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'posted', posted_pick_id: result.pickId } : i))
    return result
  }, [user])

  const postBet = useCallback(async (legs: WatchlistItem[], opts?: { content?: string; isPremium?: boolean; wagerAmount?: number | null }) => {
    if (!user) throw new Error('Sign in to post')
    const result = await postBetToFeed(user.id, legs, opts)
    const legIds = new Set(legs.map(l => l.id))
    setItems(prev => prev.map(i => legIds.has(i.id) ? { ...i, status: 'posted' } : i))
    return result
  }, [user])

  const isSaved = useCallback((mlbId: number | null, propKey: string, book: string | null) => {
    return items.some(i => i.status === 'pending' && i.mlb_id === mlbId && i.prop_key === propKey && i.book === book)
  }, [items])

  const pendingCount = items.filter(i => i.status === 'pending').length

  return (
    <Ctx.Provider value={{ items, loading, error, refresh, add, remove, postToFeed, postBet, isSaved, pendingCount, signedIn: !!user }}>
      {children}
    </Ctx.Provider>
  )
}

export function useWatchlist(): WatchlistCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useWatchlist must be used within a WatchlistProvider')
  return ctx
}
