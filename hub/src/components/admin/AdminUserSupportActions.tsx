'use client'

import { useState } from 'react'

// Lets a support rep fix an in-progress-chat user's account issue in one
// click instead of walking them through the site — matches the exact
// actions this member type of request keeps coming up as: forgot password,
// stuck unverified, needs their email changed. Each one emails the real
// Supabase confirmation/reset link (generated server-side via the Admin
// API) through the site's own Resend sender rather than Supabase's built-in
// mailer, same as every other transactional email this codebase sends.
export function AdminUserSupportActions({ userId, emailVerified }: { userId: string; emailVerified: boolean }) {
  const [loading, setLoading] = useState<string | null>(null)
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [newEmail, setNewEmail] = useState('')

  async function call(action: string, value?: string) {
    setLoading(action)
    setStatus(null)
    try {
      const res = await fetch('/api/admin/users/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action, value }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setStatus({ ok: false, message: data?.error || 'Action failed' }); return }
      setStatus({ ok: true, message: data?.message ?? 'Sent.' })
      if (action === 'changeEmail') setNewEmail('')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div>
      <p className="text-zinc-500 font-bold uppercase tracking-wider text-[10px] mb-2">Support Actions</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => call('sendPasswordReset')}
          disabled={loading !== null}
          className="text-[10px] font-bold px-2 py-1 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white transition-colors disabled:opacity-50"
        >
          {loading === 'sendPasswordReset' ? 'Sending…' : 'Send Password Reset'}
        </button>
        {!emailVerified && (
          <button
            onClick={() => call('resendVerification')}
            disabled={loading !== null}
            className="text-[10px] font-bold px-2 py-1 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white transition-colors disabled:opacity-50"
          >
            {loading === 'resendVerification' ? 'Sending…' : 'Resend Verification'}
          </button>
        )}
        <button
          onClick={() => call('reconcileMembership')}
          disabled={loading !== null}
          title="Re-checks this user's real Whop membership state and corrects their tier if it's out of sync — e.g. a purchase that never reflected, or a tier wrongly reset by an unrelated failed/abandoned signup on the same Whop account."
          className="text-[10px] font-bold px-2 py-1 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white transition-colors disabled:opacity-50"
        >
          {loading === 'reconcileMembership' ? 'Reconciling…' : 'Reconcile Membership'}
        </button>
        <div className="flex items-center gap-1.5">
          <input
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            placeholder="new@email.com"
            className="text-[11px] px-2 py-1 rounded-lg bg-zinc-900 text-zinc-200 border border-zinc-700 outline-none w-40"
          />
          <button
            onClick={() => newEmail && call('changeEmail', newEmail)}
            disabled={loading !== null || !newEmail}
            className="text-[10px] font-bold px-2 py-1 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white transition-colors disabled:opacity-50"
          >
            {loading === 'changeEmail' ? 'Sending…' : 'Send Change-Email Link'}
          </button>
        </div>
      </div>
      {status && (
        <p className={`mt-1.5 text-[11px] ${status.ok ? 'text-green-400' : 'text-red-400'}`}>{status.message}</p>
      )}
    </div>
  )
}
