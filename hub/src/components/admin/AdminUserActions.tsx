'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function AdminUserActions({ userId, currentType, isVerified, bannedUntil }: {
  userId: string; currentType: string; isVerified: boolean; bannedUntil?: string | null
}) {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()
  const isBanned = !!bannedUntil && new Date(bannedUntil) > new Date()

  async function setType(type: string) {
    setLoading(true)
    await supabase.from('users').update({ account_type: type }).eq('id', userId)
    router.refresh()
    setLoading(false)
  }

  async function toggleVerify() {
    setLoading(true)
    await supabase.from('users').update({ is_verified: !isVerified }).eq('id', userId)
    router.refresh()
    setLoading(false)
  }

  async function toggleBan() {
    setLoading(true)
    // Ban state lives in Supabase Auth (auth.users.banned_until), not a
    // plain public.users column — needs the service-role Admin Auth API,
    // not a table update, so this goes through a server route.
    await fetch('/api/admin/users/ban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ban: !isBanned }),
    })
    router.refresh()
    setLoading(false)
  }

  async function deleteUser() {
    if (!confirm('Permanently delete this user? This cannot be undone.')) return
    setLoading(true)
    await supabase.from('users').delete().eq('id', userId)
    router.refresh()
    setLoading(false)
  }

  return (
    <div className="flex items-center gap-1">
      <button onClick={toggleVerify} disabled={loading}
        className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-colors ${isVerified ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20' : 'bg-zinc-800 text-zinc-500 hover:text-white'}`}>
        {isVerified ? '✓ Verified' : 'Verify'}
      </button>
      {currentType !== 'admin' && (
        <button onClick={() => setType('admin')} disabled={loading}
          className="text-[10px] font-bold px-2 py-1 rounded-lg bg-zinc-800 text-zinc-500 hover:text-white transition-colors">
          Make Admin
        </button>
      )}
      {currentType !== 'creator' && (
        <button onClick={() => setType('creator')} disabled={loading}
          className="text-[10px] font-bold px-2 py-1 rounded-lg bg-zinc-800 text-zinc-500 hover:text-yellow-400 transition-colors">
          Make Creator
        </button>
      )}
      {currentType !== 'user' && (
        <button onClick={() => setType('user')} disabled={loading}
          className="text-[10px] font-bold px-2 py-1 rounded-lg bg-zinc-800 text-zinc-500 hover:text-white transition-colors">
          Reset
        </button>
      )}
      <button onClick={toggleBan} disabled={loading}
        className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-colors ${isBanned ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-zinc-800 text-zinc-500 hover:text-red-400'}`}>
        {isBanned ? 'Unban' : 'Ban'}
      </button>
      <button onClick={deleteUser} disabled={loading}
        className="text-[10px] font-bold px-2 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
        Delete
      </button>
    </div>
  )
}
