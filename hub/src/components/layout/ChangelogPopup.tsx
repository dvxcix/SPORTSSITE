'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/Modal'
import type { ChangelogEntry } from '@/lib/changelog'

// Mounted globally (root layout, alongside SiteBanner) — on first load for a
// signed-in member, shows every active changelog entry they haven't
// dismissed yet, one at a time. Unlike SiteBanner's dismissal (sessionStorage,
// comes back next browser session), a dismissal here is a real row in
// changelog_dismissals: permanent, per account, follows the member across
// devices — "next time they access the page... until they hit Don't Show
// again" means exactly once, ever, not once per session.
export function ChangelogPopup() {
  const [queue, setQueue] = useState<ChangelogEntry[]>([])

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return
      const [{ data: entries }, { data: dismissals }] = await Promise.all([
        supabase.from('changelog_entries').select('*').eq('is_active', true).order('created_at', { ascending: true }),
        supabase.from('changelog_dismissals').select('entry_id').eq('user_id', user.id),
      ])
      if (cancelled) return
      const dismissedIds = new Set((dismissals ?? []).map(d => d.entry_id as string))
      setQueue((entries ?? []).filter(e => !dismissedIds.has(e.id)) as ChangelogEntry[])
    })()
    return () => { cancelled = true }
  }, [])

  if (!queue.length) return null
  const current = queue[0]

  async function dismiss() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.from('changelog_dismissals').insert({ user_id: user.id, entry_id: current.id })
    setQueue(prev => prev.slice(1))
  }

  return (
    <Modal onClose={dismiss} maxWidth={440} zIndex={300}>
      <div style={{ position: 'sticky', top: 0, padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 2 }}>
          What's New
        </div>
        <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)' }}>{current.title}</div>
      </div>

      {current.screenshot_urls.length > 0 && (
        <div style={{ display: 'flex', overflowX: 'auto', gap: 8, padding: '12px 16px 0' }}>
          {current.screenshot_urls.map(url => (
            <img key={url} src={url} alt="" style={{ maxHeight: 220, borderRadius: 8, border: '1px solid var(--border)', flexShrink: 0 }} />
          ))}
        </div>
      )}

      <div style={{ padding: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{current.description}</p>
        {current.how_to_use && (
          <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>How to use it</div>
            <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{current.how_to_use}</p>
          </div>
        )}
      </div>

      <div style={{ position: 'sticky', bottom: 0, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
        <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{queue.length > 1 ? `1 of ${queue.length}` : ''}</span>
        <button
          onClick={dismiss}
          style={{ fontSize: 12, fontWeight: 800, cursor: 'pointer', border: '1px solid var(--accent)', borderRadius: 8, padding: '7px 16px', background: 'var(--accent-dim)', color: 'var(--accent)' }}
        >
          Got it — Don't show again
        </button>
      </div>
    </Modal>
  )
}
