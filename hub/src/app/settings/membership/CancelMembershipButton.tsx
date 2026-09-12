'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function CancelMembershipButton({ renewalDate }: { renewalDate: string | null }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/whop/cancel-membership', { method: 'POST' })
      if (!res.ok) {
        setError('Your subscription could not be canceled. Please try again.')
        setSubmitting(false)
        return
      }
      router.refresh()
    } catch {
      setError('Could not reach the server — please try again.')
      setSubmitting(false)
    }
  }

  if (confirming) {
    return (
      <div>
        <p className="text-sm text-white mb-3">
          Cancel your subscription{renewalDate ? ` — you'll keep access until ${renewalDate}, then your account moves to Free` : ''}?
        </p>
        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="bg-red-500 hover:bg-red-400 disabled:opacity-60 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
          >
            {submitting ? 'Cancelling…' : 'Yes, cancel'}
          </button>
          <button
            type="button"
            onClick={() => { setConfirming(false); setError(null) }}
            disabled={submitting}
            className="border border-zinc-700 text-white hover:bg-zinc-800 disabled:opacity-60 font-bold px-4 py-2 rounded-xl text-sm transition-colors"
          >
            Never mind
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="border border-zinc-700 text-white hover:bg-zinc-800 font-bold px-4 py-2 rounded-xl text-sm transition-colors"
    >
      Cancel subscription
    </button>
  )
}
