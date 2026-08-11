'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// Supabase error labels for expired/already-used recovery links aren't
// exactly the friendliest wording to show verbatim — map the ones that
// actually show up here to something a member can act on.
const LINK_ERROR_LABEL: Record<string, string> = {
  otp_expired: 'This reset link has expired.',
  access_denied: 'This reset link is no longer valid — it may have already been used.',
}

export default function ResetPasswordPage() {
  const supabase = createClient()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  // 'checking' while we wait to see whether the emailed link actually
  // produced a session; 'valid' once one shows up; 'invalid' either because
  // Supabase redirected back with an explicit error (expired/already-used
  // link — the code param is swapped for `error`/`error_code` in that case)
  // or because no session ever materializes within the timeout (the
  // cross-device case: this is a PKCE flow, so the code exchange needs the
  // verifier stored in THIS browser's localStorage from when the reset was
  // requested — open the email link on a different browser/device and the
  // code is silently ignored, no session, no error param either). Both
  // failure modes previously left the member staring at a normal-looking
  // "set new password" form that only failed, confusingly, after they'd
  // filled it in and hit submit.
  const [linkStatus, setLinkStatus] = useState<'checking' | 'valid' | 'invalid'>('checking')
  const [linkError, setLinkError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search || window.location.hash.replace(/^#/, ''))
    const errorCode = params.get('error_code') || params.get('error')
    if (errorCode) {
      window.queueMicrotask(() => {
        setLinkError(LINK_ERROR_LABEL[errorCode] || params.get('error_description')?.replace(/\+/g, ' ') || 'This reset link is invalid.')
        setLinkStatus('invalid')
      })
      return
    }
    // No error AND no code means this page was opened directly, not from an
    // actual reset email — nothing to wait on. Required so an already
    // logged-in browser (any pre-existing, unrelated session) can't make a
    // bare/bookmarked visit to this URL look like a successful reset link —
    // confirmed live: without this check, visiting this page signed-in with
    // zero query params still flipped straight to the "valid" form.
    if (!params.get('code')) {
      window.queueMicrotask(() => {
        setLinkError('This page is only reachable from a password reset email.')
        setLinkStatus('invalid')
      })
      return
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setLinkStatus('valid')
    })
    // Covers the case where a session already existed the instant this
    // mounted (onAuthStateChange only fires on a CHANGE, not the current
    // state) and the cross-device case where nothing ever fires at all.
    const timeout = setTimeout(() => {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) setLinkStatus('valid')
        else { setLinkError('This reset link isn’t working — it may have expired, already been used, or been opened in a different browser than the one you requested it from.'); setLinkStatus('invalid') }
      })
    }, 2500)
    return () => { sub.subscription.unsubscribe(); clearTimeout(timeout) }
  }, [supabase])

  async function reset() {
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) { setError(err.message); setLoading(false); return }
    setDone(true)
    setTimeout(() => router.push('/feed'), 2000)
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="text-3xl font-black">
            <span className="text-white">Slip</span><span className="text-green-400">Surge</span>
          </Link>
          <p className="text-zinc-400 text-sm mt-2">Set a new password</p>
        </div>

        {linkStatus === 'checking' ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
            <p className="text-sm text-zinc-400">Verifying your reset link…</p>
          </div>
        ) : linkStatus === 'invalid' ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center">
            <p className="text-2xl mb-3">⚠️</p>
            <p className="font-bold text-white mb-1">Link didn’t work</p>
            <p className="text-sm text-zinc-400">{linkError}</p>
            <p className="text-xs text-zinc-500 mt-3">
              If you opened this link on a different device or browser than the one you requested it from, open it on the original one instead — or just request a new link below.
            </p>
            <Link href="/auth/forgot-password" className="inline-block mt-4 bg-green-500 hover:bg-green-400 text-black font-black px-4 py-2 rounded-xl text-sm transition-colors">
              Request a new link
            </Link>
          </div>
        ) : done ? (
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
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters"
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
