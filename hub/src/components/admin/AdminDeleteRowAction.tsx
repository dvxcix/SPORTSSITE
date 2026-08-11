'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useFeedback } from '@/components/ui/FeedbackProvider'

// Generic "delete this row" button for simple admin list pages — same
// pattern as AdminPostActions but reused across tables instead of a
// near-identical component per table.
export function AdminDeleteRowAction({ table, id, confirmLabel = 'this item' }: {
  table: string; id: string; confirmLabel?: string
}) {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()
  const { confirm, notify } = useFeedback()

  async function del() {
    if (!await confirm({ title: 'Delete item?', message: `Delete ${confirmLabel}? This action cannot be undone.`, confirmLabel: 'Delete', tone: 'error' })) return
    setLoading(true)
    const { error } = await supabase.from(table).delete().eq('id', id)
    setLoading(false)
    // Previously refreshed unconditionally — a blocked delete (RLS, FK
    // constraint) looked identical to a successful one until the admin
    // noticed the row was still there, with nothing explaining why.
    if (error) { notify({ title: 'Delete failed', message: error.message, tone: 'error' }); return }
    router.refresh()
  }

  return (
    <button onClick={del} disabled={loading}
      className="text-[10px] font-bold px-2 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40">
      Delete
    </button>
  )
}
