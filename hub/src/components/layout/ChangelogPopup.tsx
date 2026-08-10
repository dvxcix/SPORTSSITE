'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/Modal'
import { ChangelogPopupBody } from '@/components/layout/ChangelogPopupBody'
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
      <ChangelogPopupBody
        title={current.title}
        description={current.description}
        how_to_use={current.how_to_use}
        screenshot_urls={current.screenshot_urls}
        audienceLabel={current.audience_tier === 'ultimate' ? 'Ultimate release' : undefined}
        queuePosition={queue.length > 1 ? `1 of ${queue.length}` : ''}
        onDismiss={dismiss}
      />
    </Modal>
  )
}
