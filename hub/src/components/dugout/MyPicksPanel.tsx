'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { ClipboardList } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { fetchMyPicks } from '@/lib/myPicks'
import { PostCardClient } from '@/components/social/PostCardClient'
import type { Post } from '@/lib/supabase/types'
import { useDraggableFab } from '@/lib/useDraggableFab'
import { ModalSurface } from '@/components/ui/ModalSurface'

export function MyPicksButton() {
  const { user } = useAuth()
  const fab = useDraggableFab('mp-fab-pos')
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'active' | 'history'>('active')
  const [limit, setLimit] = useState(50)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!user) { setItems([]); setLoading(false); return }
    setLoading(true)
    try {
      const rows = await fetchMyPicks(user.id, view, limit)
      setItems(rows)
      setError('')
    } catch (e) {
      console.error('[MyPicksPanel] failed to load picks', e)
      setError('Could not load your picks. Please retry.')
    } finally {
      setLoading(false)
    }
  }, [user, view, limit])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    const update = () => { void refresh() }
    window.addEventListener('ss:picks-updated', update)
    window.addEventListener('focus', update)
    return () => { window.removeEventListener('ss:picks-updated', update); window.removeEventListener('focus', update) }
  }, [refresh])

  // Picks up anything posted from the watchlist (or the composer) while the
  // panel is mounted, so a just-posted parlay shows here immediately without
  // needing to close/reopen the panel to trigger a refetch.
  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    const channel = supabase
      .channel(`my-picks-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts', filter: `author_id=eq.${user.id}` }, (payload: any) => {
        const row = payload.new as Post
        if (row.post_type === 'pick' || row.post_type === 'parlay' || payload.eventType === 'DELETE') {
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
        @media (max-width: 767px), (max-width: 1024px) and (any-pointer: coarse) { .mp-fab { bottom: calc(146px + env(safe-area-inset-bottom, 0px)); } }
      `}</style>
      <button
        ref={fab.ref}
        className="mp-fab"
        title="Drag to move"
        onClick={() => { setOpen(true); void refresh() }}
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

      <ModalSurface
        open={open}
        onClose={() => setOpen(false)}
        labelledBy="my-picks-panel-title"
        backdropStyle={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.62)', zIndex: 'var(--layer-modal)', display: 'flex', justifyContent: 'flex-end', backdropFilter: 'blur(6px)' }}
        panelStyle={{
          width: 'min(420px, 100vw)', height: '100%', background: 'var(--bg)',
          borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
          animation: 'slideIn 0.2s ease-out', outline: 'none',
        }}
      >
            <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <span id="my-picks-panel-title" style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <ClipboardList size={16} /> My Picks
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{items.length} {view === 'active' ? 'active' : 'in history'}</span>
              <button type="button" data-modal-autofocus aria-label="Close my picks" onClick={() => setOpen(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
            <nav aria-label="Pick status" style={{ display: 'flex', gap: 12, padding: 12 }}>
              {(['active', 'history'] as const).map(tab => <button key={tab} type="button" aria-pressed={view === tab} onClick={() => { setView(tab); setLimit(50) }} style={{ minHeight: 44, padding: '8px 18px', color: view === tab ? 'var(--accent)' : 'var(--text-2)' }}>{tab === 'active' ? 'Active Picks' : 'History'}</button>)}
            </nav>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {error && <div role="alert" style={{ padding: 16 }}>{error} <button type="button" onClick={() => void refresh()}>Retry</button></div>}
              {loading ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>Loading…</div>
              ) : items.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
                  {view === 'active' ? 'No active picks.' : 'No picks in your history yet.'}<br />Post a straight bet or parlay from your Watchlist to track it here.
                </div>
              ) : (
                <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {items.map((p, i) => (
                    <PostCardClient key={p.id} post={p as any} index={i} />
                  ))}
                  {items.length >= limit && <button type="button" onClick={() => setLimit(value => value + 50)}>Load More</button>}
                </div>
              )}
            </div>
      </ModalSurface>
    </>
  )
}
