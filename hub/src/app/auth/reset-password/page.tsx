'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { AuthShell } from '@/components/auth/AuthShell'

// Supabase error labels for expired/already-used recovery links aren't
// exactly the friendliest wording to show verbatim — map the ones that
// actually show up here to something a member can act on.
const LINK_ERROR_LABEL: Record<string, string> = {
  otp_expired: 'This reset link has expired.',
  access_denied: 'This reset link is no longer valid — it may have already been used.',
}

export default function ResetPasswordPage() {
  const supabase = useMemo(() => createClient(), [])
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
    <AuthShell eyebrow="Account recovery" title="Set a new password" description="Choose a strong password you don’t use elsewhere.">
        {linkStatus === 'checking' ? (
          <div className="ss-auth-status" role="status">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-lime-300/25 border-t-lime-300" aria-hidden="true" />
            <p>Verifying your reset link…</p>
          </div>
        ) : linkStatus === 'invalid' ? (
          <div className="ss-auth-card text-center">
            <AlertTriangle size={26} className="mx-auto text-rose-400" aria-hidden="true" />
            <strong className="text-white">Link didn’t work</strong>
            <p className="text-xs leading-relaxed text-zinc-400">{linkError}</p>
            <Link href="/auth/forgot-password" className="ss-auth-submit">
              Request a new link
            </Link>
          </div>
        ) : done ? (
          <div className="ss-auth-success">
            <CheckCircle2 size={26} aria-hidden="true" />
            <strong>Password updated</strong>
            <p>Taking you back to your feed…</p>
          </div>
        ) : (
          <div className="ss-auth-card">
            {error && <div role="alert" className="ss-auth-alert">{error}</div>}
            <div>
              <label>New password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters"
                autoComplete="new-password" className="ss-input" />
            </div>
            <div>
              <label>Confirm password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password"
                autoComplete="new-password" className="ss-input" />
            </div>
            <button onClick={reset} disabled={loading || !password || !confirm}
              className="ss-auth-submit">
              {loading ? 'Updating…' : 'Set new password'}
            </button>
          </div>
        )}
    </AuthShell>
  )
}
