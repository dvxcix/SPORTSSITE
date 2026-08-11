'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFeedback } from '@/components/ui/FeedbackProvider'

export function AdminDeletionActions({ requestId, status }: { requestId: string; status: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const { notify, prompt } = useFeedback()
  if (!['pending', 'reviewing', 'blocked'].includes(status)) return null

  async function update(nextStatus: 'reviewing' | 'blocked' | 'scheduled' | 'canceled') {
    const note = await prompt({
      title: nextStatus === 'blocked' ? 'Block deletion request' : 'Update deletion request',
      label: 'Internal note',
      message: 'Add context for the admin audit trail. This is not shown to the member.',
      placeholder: nextStatus === 'blocked' ? 'Why is this request blocked?' : 'Optional resolution note',
      multiline: true,
    })
    if (note === null) return
    let scheduledFor: string | undefined
    if (nextStatus === 'scheduled') {
      const value = await prompt({
        title: 'Schedule account deletion',
        label: 'Deletion date and time',
        message: 'Choose the exact date and time for the scheduled deletion.',
        type: 'datetime-local',
        confirmLabel: 'Schedule deletion',
      })
      if (!value) return
      scheduledFor = value
    }
    setLoading(true)
    const response = await fetch(`/api/admin/account-deletions/${requestId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextStatus, note, scheduledFor }) })
    const body = await response.json().catch(() => ({}))
    setLoading(false)
    if (!response.ok) { notify({ title: 'Request not updated', message: body.error || 'Please try again.', tone: 'error' }); return }
    router.refresh()
  }

  return <div className="flex flex-wrap gap-2">
    {status === 'pending' ? <button disabled={loading} onClick={() => update('reviewing')} className="rounded-lg border border-cyan-400/30 px-3 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-400/10 disabled:opacity-40">Review</button> : null}
    <button disabled={loading} onClick={() => update('blocked')} className="rounded-lg border border-amber-400/30 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-400/10 disabled:opacity-40">Block</button>
    <button disabled={loading} onClick={() => update('scheduled')} className="rounded-lg border border-red-400/30 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-400/10 disabled:opacity-40">Schedule</button>
    <button disabled={loading} onClick={() => update('canceled')} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-bold text-zinc-400 hover:text-white disabled:opacity-40">Cancel</button>
  </div>
}
