'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function AdminUserActions({ userId, currentType, isVerified, bannedUntil }: {
  userId: string; currentType: string; isVerified: boolean; bannedUntil?: string | null
}) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const isBanned = !!bannedUntil && new Date(bannedUntil) > new Date()

  // users.UPDATE/DELETE RLS only allows auth.uid() = id — a direct
  // supabase.from('users').update(...) here silently no-ops for any OTHER
  // user with no error surfaced (which is exactly why "Verify" looked like
  // it did nothing). Routes through the service-role admin API instead,
  // same fix "Ban" already needed.
  async function callManage(body: Record<string, unknown>) {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { alert(data?.error || 'Action failed'); return }
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  const setType = (type: string) => callManage({ userId, action: 'setType', value: type })
  const toggleVerify = () => callManage({ userId, action: 'verify', value: !isVerified })
  const deleteUser = () => {
    if (!confirm('Permanently delete this user? This cannot be undone.')) return
    callManage({ userId, action: 'delete' })
  }

  async function toggleBan() {
    setLoading(true)
    // Ban state lives in Supabase Auth (auth.users.banned_until), not a
    // plain public.users column — needs the service-role Admin Auth API,
    // not a table update, so this goes through a server route.
    const res = await fetch('/api/admin/users/ban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ban: !isBanned }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) alert(data?.error || 'Action failed')
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
