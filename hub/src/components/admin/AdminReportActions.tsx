'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFeedback } from '@/components/ui/FeedbackProvider'

export function AdminReportActions({ reportId, currentStatus }: { reportId: string; currentStatus: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const { notify, prompt } = useFeedback()

  async function update(status: string) {
    const resolutionNote = await prompt({
      title: status === 'actioned' ? 'Record moderation action' : 'Dismiss report',
      label: 'Internal note',
      message: 'This note is stored with the report for the moderation team.',
      placeholder: status === 'actioned' ? 'What action was taken?' : 'Why was this report dismissed?',
      confirmLabel: status === 'actioned' ? 'Save action' : 'Dismiss report',
      multiline: true,
    })
    if (resolutionNote === null) return
    setLoading(true)
    const response = await fetch(`/api/admin/reports/${reportId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status, resolutionNote }),
    })
    const result = await response.json().catch(() => ({}))
    setLoading(false)
    if (!response.ok) { notify({ title: 'Report not updated', message: result.error || 'Unknown error', tone: 'error' }); return }
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
