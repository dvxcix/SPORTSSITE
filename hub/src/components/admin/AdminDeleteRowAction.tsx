'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

// Generic "delete this row" button for simple admin list pages — same
// pattern as AdminPostActions but reused across tables instead of a
// near-identical component per table.
export function AdminDeleteRowAction({ table, id, confirmLabel = 'this item' }: {
  table: string; id: string; confirmLabel?: string
}) {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  async function del() {
    if (!confirm(`Delete ${confirmLabel}?`)) return
    setLoading(true)
    await supabase.from(table).delete().eq('id', id)
    router.refresh()
    setLoading(false)
  }

  return (
    <button onClick={del} disabled={loading}
      className="text-[10px] font-bold px-2 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40">
      Delete
    </button>
  )
}
