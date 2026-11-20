'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { CheckCircle, Trash2 } from 'lucide-react'
import { useFeedback } from '@/components/ui/FeedbackProvider'

export function AdminPageActions({ pageId, isVerified }: { pageId: string; isVerified: boolean }) {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const { confirm, notify } = useFeedback()

  async function verify() {
    setLoading(true)
    const { error } = await supabase.from('pages').update({ is_verified: !isVerified }).eq('id', pageId)
    setLoading(false)
    if (error) { notify({ title: 'Update failed', message: error.message, tone: 'error' }); return }
    router.refresh()
  }

  async function del() {
    if (!await confirm({ title: 'Delete page?', message: 'This community page will be permanently removed.', confirmLabel: 'Delete page', tone: 'error' })) return
    setLoading(true)
    const { error } = await supabase.from('pages').delete().eq('id', pageId)
    setLoading(false)
    if (error) { notify({ title: 'Delete failed', message: error.message, tone: 'error' }); return }
    router.refresh()
  }

  return (
    <div className="flex gap-1">
      <button type="button" onClick={verify} disabled={loading} aria-label={isVerified ? 'Remove page verification' : 'Verify page'} aria-pressed={isVerified}
        className={`p-1.5 rounded-lg transition-colors ${isVerified ? 'text-[var(--green)] bg-[color-mix(in_srgb,var(--green)_10%,transparent)]' : 'text-[var(--text-3)] hover:text-[var(--green)] hover:bg-[color-mix(in_srgb,var(--green)_10%,transparent)]'}`}>
        <CheckCircle size={13} />
      </button>
      <button type="button" onClick={del} disabled={loading} aria-label="Delete page"
        className="p-1.5 text-[var(--text-3)] hover:text-[var(--red)] hover:bg-[color-mix(in_srgb,var(--red)_10%,transparent)] rounded-lg transition-colors">
        <Trash2 size={13} />
      </button>
    </div>
  )
}
