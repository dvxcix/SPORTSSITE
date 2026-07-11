'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { CheckCircle, Trash2 } from 'lucide-react'

export function AdminPageActions({ pageId, isVerified }: { pageId: string; isVerified: boolean }) {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function verify() {
    setLoading(true)
    await supabase.from('pages').update({ is_verified: !isVerified }).eq('id', pageId)
    router.refresh(); setLoading(false)
  }

  async function del() {
    if (!confirm('Delete this page?')) return
    setLoading(true)
    await supabase.from('pages').delete().eq('id', pageId)
    router.refresh(); setLoading(false)
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
