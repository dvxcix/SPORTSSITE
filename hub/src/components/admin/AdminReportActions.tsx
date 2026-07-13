'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function AdminReportActions({ reportId, currentStatus }: { reportId: string; currentStatus: string }) {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function update(status: string) {
    setLoading(true)
    const { error } = await supabase.from('reports').update({ status }).eq('id', reportId)
    setLoading(false)
    if (error) { alert(`Could not update: ${error.message}`); return }
    router.refresh()
  }

  if (currentStatus !== 'pending') return null

  return (
    <div className="flex gap-2 shrink-0">
      <button onClick={() => update('dismissed')} disabled={loading}
        className="text-xs font-bold border border-zinc-700 text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40">
        Dismiss
      </button>
      <button onClick={() => update('actioned')} disabled={loading}
        className="text-xs font-bold border border-red-500/50 text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40">
        Action
      </button>
    </div>
  )
}
