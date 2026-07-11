'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function send() {
    if (!email.trim()) return
    setLoading(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    if (err) { setError(err.message); setLoading(false); return }
    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="text-3xl font-black">
            <span className="text-white">Slip</span><span className="text-green-400">Surge</span>
          </Link>
          <p className="text-zinc-400 text-sm mt-2">Reset your password</p>
        </div>

        {sent ? (
          <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6 text-center">
            <p className="text-2xl mb-3">📧</p>
            <p className="font-bold text-white mb-1">Check your email</p>
            <p className="text-sm text-zinc-400">We sent a password reset link to <span className="text-white font-medium">{email}</span></p>
            <Link href="/auth/login" className="inline-block mt-4 text-sm text-green-400 hover:text-green-300">Back to sign in</Link>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
            {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1.5">Email address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder="you@example.com"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 transition-all" />
            </div>
            <button onClick={send} disabled={loading || !email.trim()}
              className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black py-3 rounded-xl transition-colors">
              {loading ? 'Sending…' : 'Send Reset Link'}
            </button>
            <Link href="/auth/login" className="block text-center text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              Back to sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
