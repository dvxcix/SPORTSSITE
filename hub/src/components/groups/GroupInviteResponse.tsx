'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function GroupInviteResponse({ inviteId, invitedByUsername }: {
  inviteId: string; invitedByUsername?: string
}) {
  const [loading, setLoading] = useState(false)
  const [declined, setDeclined] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function accept() {
    setLoading(true)
    setError('')
    try {
      const response=await fetch('/api/groups/invitations/respond',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({inviteId,accept:true}),signal:AbortSignal.timeout(20000)})
      const body=await response.json().catch(()=>({}))
      if(!response.ok){setError(body.error||'Could not accept the invitation. Please retry.');return}
      router.replace(`/groups/${encodeURIComponent(body.slug)}?setup=community`)
      router.refresh()
    } catch {
      setError('Could not accept invite — please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function decline() {
    setLoading(true)
    setError('')
    try {
      const response=await fetch('/api/groups/invitations/respond',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({inviteId,accept:false}),signal:AbortSignal.timeout(20000)})
      const body=await response.json().catch(()=>({}))
      if(!response.ok){setError(body.error||'Could not decline the invitation. Please retry.');return}
      setDeclined(true)
    } catch {
      setError('Could not decline invite — please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (declined) {
    return <p className="text-sm text-[var(--text-3)] bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">Invite declined.</p>
  }

  return (
    <div className="bg-[var(--surface)] border border-[color-mix(in_srgb,var(--green)_30%,transparent)] rounded-xl px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-2)]">
          {invitedByUsername ? `@${invitedByUsername} invited you` : "You've been invited"} to join this community.
        </p>
        <div className="flex gap-2 shrink-0">
          <button type="button" onClick={decline} disabled={loading}
            className="min-h-11 text-sm font-semibold border border-[var(--border-2)] text-[var(--text-2)] hover:text-[var(--text-1)] px-4 py-2 rounded-lg transition-colors disabled:opacity-40">
            Decline
          </button>
          <button type="button" onClick={accept} disabled={loading}
            className="min-h-11 text-sm font-semibold bg-[var(--accent-fill)] hover:bg-[var(--accent-fill)] text-[var(--accent-fg)] px-4 py-2 rounded-lg transition-colors disabled:opacity-40">
            {loading?'Saving…':'Accept invitation'}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-[var(--red)] mt-2" role="alert">{error}</p>}
    </div>
  )
}
