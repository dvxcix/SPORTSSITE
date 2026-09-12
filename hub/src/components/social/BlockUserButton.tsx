'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { blockUser, unblockUser } from '@/lib/blocks'
import { UserX, UserCheck } from 'lucide-react'

interface BlockUserButtonProps {
  currentUserId: string
  targetUserId: string
  targetUsername: string
  initialBlocked: boolean
  // 'dropdown-item' matches the ss-dropdown-item rows in PostCardClient's
  // post menu, 'text' matches the inline text buttons in its comment rows,
  // 'button' is a standalone pill for the profile page header.
  variant?: 'dropdown-item' | 'text' | 'button'
  onDone?: () => void
}

export function BlockUserButton({ currentUserId, targetUserId, targetUsername, initialBlocked, variant = 'dropdown-item', onDone }: BlockUserButtonProps) {
  const [blocked, setBlocked] = useState(initialBlocked)
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  async function toggle() {
    setFailed(false)
    if (blocked) {
      setLoading(true)
      const { ok } = await unblockUser(supabase, currentUserId, targetUserId)
      setLoading(false)
      if (ok) { setBlocked(false); router.refresh(); onDone?.() }
      else setFailed(true)
      return
    }
    if (!confirming) { setConfirming(true); return }
    setLoading(true)
    const { ok } = await blockUser(supabase, currentUserId, targetUserId)
    setLoading(false)
    setConfirming(false)
    if (ok) { setBlocked(true); router.refresh(); onDone?.() }
    else setFailed(true)
  }

  const label = blocked ? 'Unblock' : confirming ? `Confirm block @${targetUsername}?` : `Block @${targetUsername}`

  if (variant === 'text') {
    return (
      <button onClick={toggle} disabled={loading}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: blocked ? 'var(--text-3)' : 'var(--red, #f87171)' }}>
        {failed ? 'Try again' : label}
      </button>
    )
  }

  if (variant === 'button') {
    return (
      <button onClick={toggle} disabled={loading}
        className={`flex items-center gap-1.5 h-9 px-4 text-sm rounded-xl font-black transition-all disabled:opacity-60 ${
          blocked
            ? 'border border-zinc-700 text-zinc-300 hover:border-green-500/50 hover:text-green-400'
            : 'border border-red-500/30 text-red-400 hover:bg-red-500/10'
        }`}>
        {failed ? 'Try again' : blocked ? <><UserCheck size={14} /> Unblock</> : confirming ? 'Confirm block?' : <><UserX size={14} /> Block</>}
      </button>
    )
  }

  return (
    <button onClick={toggle} disabled={loading}
      className={`ss-dropdown-item ${blocked ? '' : 'danger'}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {blocked ? <UserCheck size={12} /> : <UserX size={12} />} {failed ? 'Try again' : label}
    </button>
  )
}
