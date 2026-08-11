'use client'

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

type LiveCallback = (payload: any) => void

interface PostLiveContextValue {
  subscribe: (postId: string, cb: LiveCallback) => () => void
}

const PostLiveContext = createContext<PostLiveContextValue | null>(null)

// Every rendered post card used to open its OWN Supabase Realtime channel
// (post-live:${postId}:${instanceId}) — a 30-post feed meant 30 concurrent
// connections per open tab, on top of one for notifications and one per
// open DM thread. Supabase Realtime has a real per-project concurrent-
// connection cap; that pattern multiplies straight into it at anything
// approaching thousands of simultaneous viewers. This mounts ONE channel
// for the whole app (in the root layout) and fans UPDATE events out to
// whichever post cards actually have that post's id mounted right now —
// same live-update behavior, one connection total instead of one per card.
//
// Realtime's postgres_changes filter syntax can't express "id in (this
// page's rendered posts)", only a single-value match — so this channel is
// unfiltered (every posts UPDATE row-wide) and the fan-out/discard happens
// client-side via the subscriber map, which is a cheap in-memory lookup
// regardless of how many other posts are being updated elsewhere.
export function PostLiveProvider({ children }: { children: ReactNode }) {
  const subscribersRef = useRef(new Map<string, Set<LiveCallback>>())
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const channel = supabase
      .channel('posts-live-shared')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts' }, (payload: any) => {
        const id = payload.new?.id
        if (!id) return
        subscribersRef.current.get(id)?.forEach(cb => cb(payload))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  const value = useMemo<PostLiveContextValue>(() => ({
    subscribe(postId, cb) {
      let set = subscribersRef.current.get(postId)
      if (!set) { set = new Set(); subscribersRef.current.set(postId, set) }
      set.add(cb)
      return () => {
        set!.delete(cb)
        if (set!.size === 0) subscribersRef.current.delete(postId)
      }
    },
  }), [])

  return <PostLiveContext.Provider value={value}>{children}</PostLiveContext.Provider>
}

// onUpdate is read via a ref so callers can pass an inline closure without
// re-subscribing (and briefly missing events) on every render.
export function usePostLiveUpdates(postId: string | undefined, onUpdate: LiveCallback) {
  const ctx = useContext(PostLiveContext)
  const cbRef = useRef(onUpdate)
  useEffect(() => {
    cbRef.current = onUpdate
  }, [onUpdate])
  useEffect(() => {
    if (!ctx || !postId) return
    return ctx.subscribe(postId, payload => cbRef.current(payload))
  }, [ctx, postId])
}
