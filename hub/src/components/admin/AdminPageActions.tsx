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
      <button onClick={verify} disabled={loading}
        className={`p-1.5 rounded-lg transition-colors ${isVerified ? 'text-green-400 bg-green-400/10' : 'text-zinc-500 hover:text-green-400 hover:bg-green-400/10'}`}>
        <CheckCircle size={13} />
      </button>
      <button onClick={del} disabled={loading}
        className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
        <Trash2 size={13} />
      </button>
    </div>
  )
}
