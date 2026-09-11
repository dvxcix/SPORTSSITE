'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { AuthShell } from '@/components/auth/AuthShell'

export default function ForgotPasswordPage() {
  const supabase = useMemo(() => createClient(), [])
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
    <AuthShell eyebrow="Account recovery" title="Reset your password" description="We’ll send a secure reset link to your email.">
        {sent ? (
          <div className="ss-auth-success">
            <CheckCircle2 size={26} aria-hidden="true" />
            <strong>Check your email</strong>
            <p>We sent a password reset link to <span className="text-white font-medium">{email}</span>.</p>
            <Link href="/auth/login" className="ss-auth-link mt-4 inline-block">Back to sign in</Link>
          </div>
        ) : (
          <div className="ss-auth-card">
            {error && <div role="alert" className="ss-auth-alert">{error}</div>}
            <div>
              <label>Email address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder="you@example.com"
                autoComplete="email"
                className="ss-input" />
            </div>
            <button onClick={send} disabled={loading || !email.trim()}
              className="ss-auth-submit">
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <Link href="/auth/login" className="ss-auth-muted-link text-center">
              Back to sign in
            </Link>
            {/* Not conditional on whether this email actually has a password —
                doing that lookup here would let this form be used to probe
                which emails have accounts. Shown unconditionally instead, so
                it costs nothing for password accounts and saves a support
                ticket for the (common) case of someone who signed up with
                Discord/X and has no password to reset in the first place. */}
            <p className="ss-auth-note">
              Signed up with Discord or X? There&apos;s no password to reset — just{' '}
              <Link href="/auth/login" className="text-zinc-300 underline">sign in that same way</Link>.
            </p>
          </div>
        )}
    </AuthShell>
  )
}
