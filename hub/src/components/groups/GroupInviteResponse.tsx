'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function GroupInviteResponse({ inviteId, invitedByUsername }: {
  inviteId: string; invitedByUsername?: string
}) {
  const [loading, setLoading] = useState(false)
  const [declined, setDeclined] = useState(false)
  const [error, setError] = useState('')
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  async function accept() {
    setLoading(true)
    setError('')
    try {
      const { error: responseError } = await supabase.rpc('respond_to_group_invite', { p_invite_id: inviteId, p_accept: true })
      if (responseError) { setError('Could not accept invite — please try again.'); return }
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
      const { error: responseError } = await supabase.rpc('respond_to_group_invite', { p_invite_id: inviteId, p_accept: false })
      if (responseError) { setError('Could not decline invite — please try again.'); return }
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
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-2)]">
          {invitedByUsername ? `@${invitedByUsername} invited` : "You've been invited"} you to join this private group.
        </p>
        <div className="flex gap-2 shrink-0">
          <button type="button" onClick={decline} disabled={loading}
            className="text-xs font-bold border border-[var(--border-2)] text-[var(--text-2)] hover:text-[var(--text-1)] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40">
            Decline
          </button>
          <button type="button" onClick={accept} disabled={loading}
            className="text-xs font-bold bg-[var(--accent-fill)] hover:bg-[var(--accent-fill)] text-[var(--accent-fg)] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40">
            Accept
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-[var(--red)] mt-2" role="alert">{error}</p>}
    </div>
  )
}
