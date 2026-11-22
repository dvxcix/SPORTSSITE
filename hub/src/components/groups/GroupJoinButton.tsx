'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

export function GroupJoinButton({ groupId, initialMember, paidProductId }: {
  groupId: string; initialMember: boolean; paidProductId?: string | null
}) {
  const [member, setMember] = useState(initialMember)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()

  async function toggle() {
    if (loading) return
    setLoading(true)
    setError('')
    try {
      const { data, error: membershipError } = await supabase.rpc('set_group_membership', {
        p_group_id: groupId,
        p_join: !member,
      })
      if (membershipError) {
        setError(member ? 'Could not leave the group.' : 'Could not join the group.')
        return
      }
      setMember(Boolean(data))
      if (data) { const query=new URLSearchParams(search.toString());query.set('setup','community');router.replace(`${pathname}?${query}`, { scroll: false }) }
      else router.refresh()
    } catch {
      setError(member ? 'Could not leave the group.' : 'Could not join the group.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid justify-items-end gap-1.5">
      <button type="button" onClick={toggle} disabled={loading} aria-pressed={member}
        className={`text-xs font-semibold px-4 py-2 rounded-lg transition-all disabled:opacity-60 ${
          member ? 'border border-[var(--border-2)] text-[var(--text-2)] hover:border-[color-mix(in_srgb,var(--red)_50%,transparent)] hover:text-[var(--red)]' : 'bg-[var(--accent-fill)] hover:bg-[var(--accent-fill)] text-[var(--accent-fg)]'
        }`}>
        {loading ? 'Saving…' : member ? 'Leave Group' : 'Join Group'}
      </button>
      {paidProductId && <><Link href={`/creators/access/complete?product=${paidProductId}`} className="text-xs font-semibold text-[var(--accent)]">Manage membership</Link><p className="max-w-56 text-right text-xs text-[var(--text-3)]">Leaving the group does not cancel billing.</p></>}
      {error && <p className="max-w-52 text-right text-[12px] text-[var(--red)]" role="alert">{error} Try again.</p>}
    </div>
  )
}
