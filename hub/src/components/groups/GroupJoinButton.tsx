'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function GroupJoinButton({ groupId, initialMember }: {
  groupId: string; initialMember: boolean
}) {
  const [member, setMember] = useState(initialMember)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = useMemo(() => createClient(), [])

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
    } catch {
      setError(member ? 'Could not leave the group.' : 'Could not join the group.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid justify-items-end gap-1.5">
      <button type="button" onClick={toggle} disabled={loading} aria-pressed={member}
        className={`text-xs font-black px-4 py-2 rounded-lg transition-all disabled:opacity-60 ${
          member ? 'border border-zinc-700 text-zinc-300 hover:border-red-500/50 hover:text-red-400' : 'bg-green-500 hover:bg-green-400 text-black'
        }`}>
        {loading ? 'Saving…' : member ? 'Leave Group' : 'Join Group'}
      </button>
      {error && <p className="max-w-52 text-right text-[10px] text-red-400" role="alert">{error} Try again.</p>}
    </div>
  )
}
