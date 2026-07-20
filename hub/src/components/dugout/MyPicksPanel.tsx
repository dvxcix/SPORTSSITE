'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { ClipboardList } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { fetchMyPicks } from '@/lib/myPicks'
import { PostCardClient } from '@/components/social/PostCardClient'
import type { Post } from '@/lib/supabase/types'
import { useDraggableFab } from '@/lib/useDraggableFab'

// Same "local day" framing as the watchlist — this panel is for tracking
// slips you're live-watching today, not an archive of every pick you've
// ever posted (that's what the profile Picks tab is for).
function isFromToday(post: Post) {
  const localToday = new Date().toLocaleDateString('en-CA')
  return post.created_at?.slice(0, 10) >= localToday
}

export function MyPicksButton() {
  const { user } = useAuth()
  const fab = useDraggableFab('mp-fab-pos')
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user) { setItems([]); setLoading(false); return }
    setLoading(true)
    try {
      const rows = await fetchMyPicks(user.id)
      setItems(rows.filter(isFromToday))
    } catch (e) {
      console.error('[MyPicksPanel] failed to load picks', e)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { refresh() }, [refresh])

  // Picks up anything posted from the watchlist (or the composer) while the
  // panel is mounted, so a just-posted parlay shows here immediately without
  // needing to close/reopen the panel to trigger a refetch.
  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    const channel = supabase
      .channel(`my-picks-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts', filter: `author_id=eq.${user.id}` }, (payload: any) => {
        const row = payload.new as Post
        if ((row.post_type === 'pick' || row.post_type === 'parlay') && isFromToday(row)) {
          refresh()
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, refresh])

  if (!user) return null

  return (
    <>
      <style>{`
        .mp-fab { position: fixed; right: 20px; bottom: calc(78px + env(safe-area-inset-bottom, 0px)); z-index: 50; }
      `}</style>
      <button
        ref={fab.ref}
        className="mp-fab"
        title="Drag to move"
        onClick={() => setOpen(true)}
        {...fab.handlers}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 16px', borderRadius: 999,
          background: 'var(--surface)', color: 'var(--text-1)',
          border: '1px solid var(--border-2)', cursor: 'grab',
          fontSize: 13, fontWeight: 800,
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
          userSelect: 'none',
          ...fab.style,
        }}
      >
        <ClipboardList size={15} /> My Picks
        {items.length > 0 && (
          <span style={{
            background: 'var(--accent-dim)', color: 'var(--accent)', borderRadius: 999, padding: '1px 7px', fontSize: 11,
          }}>{items.length}</span>
        )}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(420px, 100vw)', height: '100%', background: 'var(--bg)',
              borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
              animation: 'slideIn 0.2s ease-out',
            }}
          >
            <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <ClipboardList size={16} /> My Picks
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{items.length} today</span>
              <button onClick={() => setOpen(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>Loading…</div>
              ) : items.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
                  No picks posted today yet.<br />Post a straight bet or parlay from your Watchlist to track it here.
                </div>
              ) : (
                <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {items.map((p, i) => (
                    <PostCardClient key={p.id} post={p as any} index={i} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
