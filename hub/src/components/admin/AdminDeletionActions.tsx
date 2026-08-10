'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function AdminDeletionActions({ requestId, status }: { requestId: string; status: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  if (!['pending', 'reviewing', 'blocked'].includes(status)) return null

  async function update(nextStatus: 'reviewing' | 'blocked' | 'scheduled' | 'canceled') {
    const note = window.prompt(nextStatus === 'blocked' ? 'Why is this request blocked?' : 'Internal resolution note (optional)')
    if (note === null) return
    let scheduledFor: string | undefined
    if (nextStatus === 'scheduled') {
      const value = window.prompt('Deletion date and time (for example 2026-08-20T15:00)')
      if (!value) return
      scheduledFor = value
    }
    setLoading(true)
    const response = await fetch(`/api/admin/account-deletions/${requestId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextStatus, note, scheduledFor }) })
    const body = await response.json().catch(() => ({}))
    setLoading(false)
    if (!response.ok) { window.alert(body.error || 'Request could not be updated.'); return }
    router.refresh()
  }

  return <div className="flex flex-wrap gap-2">
    {status === 'pending' ? <button disabled={loading} onClick={() => update('reviewing')} className="rounded-lg border border-cyan-400/30 px-3 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-400/10 disabled:opacity-40">Review</button> : null}
    <button disabled={loading} onClick={() => update('blocked')} className="rounded-lg border border-amber-400/30 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-400/10 disabled:opacity-40">Block</button>
    <button disabled={loading} onClick={() => update('scheduled')} className="rounded-lg border border-red-400/30 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-400/10 disabled:opacity-40">Schedule</button>
    <button disabled={loading} onClick={() => update('canceled')} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-bold text-zinc-400 hover:text-white disabled:opacity-40">Cancel</button>
  </div>
}
