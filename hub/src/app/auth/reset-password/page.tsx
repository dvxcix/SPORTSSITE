'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ResetPasswordPage() {
  const supabase = createClient()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function reset() {
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) { setError(err.message); setLoading(false); return }
    setDone(true)
    setTimeout(() => router.push('/feed'), 2000)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="text-3xl font-black">
            <span className="text-white">Slip</span><span className="text-green-400">Surge</span>
          </Link>
          <p className="text-zinc-400 text-sm mt-2">Set a new password</p>
        </div>

        {done ? (
          <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6 text-center">
            <p className="text-2xl mb-3">✅</p>
            <p className="font-bold text-white">Password updated!</p>
            <p className="text-sm text-zinc-400 mt-1">Redirecting you to your feed…</p>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
            {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1.5">New Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 6 characters"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 transition-all" />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1.5">Confirm Password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 transition-all" />
            </div>
            <button onClick={reset} disabled={loading || !password || !confirm}
              className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black py-3 rounded-xl transition-colors">
              {loading ? 'Updating…' : 'Set New Password'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
