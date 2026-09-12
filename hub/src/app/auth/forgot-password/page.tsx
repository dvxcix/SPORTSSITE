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
    setError('')
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })
      if (err) { setError('We could not send the reset link. Try again.'); return }
      setSent(true)
    } catch {
      setError('We could not send the reset link. Try again.')
    } finally {
      setLoading(false)
    }
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
          <form className="ss-auth-card" onSubmit={event => { event.preventDefault(); void send() }}>
            {error && <div role="alert" className="ss-auth-alert">{error}</div>}
            <div>
              <label>Email address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                maxLength={254}
                className="ss-input" />
            </div>
            <button type="submit" disabled={loading || !email.trim()}
              className="ss-auth-submit">
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <Link href="/auth/login" className="ss-auth-muted-link text-center">
              Back to sign in
            </Link>
          </form>
        )}
    </AuthShell>
  )
}
