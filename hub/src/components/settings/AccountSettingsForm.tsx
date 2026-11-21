'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check, Database, Loader2 } from 'lucide-react'
import { DataExportControl } from './DataExportControl'
import { AccountDeletionControl } from './AccountDeletionControl'

export function AccountSettingsForm({ profile }: { profile: any }) {
  const supabase = useMemo(() => createClient(), [])
  // Deleting the SlipSurge account has never touched Whop billing — support
  // got a real customer report of exactly this confusion, so this warning
  // has to be impossible to miss before someone deletes their account still
  // expecting that to also stop charges.
  const hasPaidTier = !!profile?.tier && profile.tier !== 'free'
  const [email, setEmail] = useState(profile?.email ?? '')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState<'email' | 'password' | null>(null)
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')

  async function updateEmail(event: React.FormEvent) {
    event.preventDefault()
    if (!email.trim()) { setError('Enter a valid email address.'); return }
    setSaving('email'); setError('')
    try {
      const { error: err } = await supabase.auth.updateUser({ email: email.trim() })
      if (err) { setError('Your email could not be updated. Try again.'); return }
      setSaved('email'); setTimeout(() => setSaved(''), 2000)
    } catch {
      setError('Your email could not be updated. Try again.')
    } finally {
      setSaving(null)
    }
  }

  async function updatePassword(event: React.FormEvent) {
    event.preventDefault()
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return }
    setSaving('password'); setError('')
    try {
      const { error: err } = await supabase.auth.updateUser({ password: newPassword })
      if (err) { setError('Your password could not be updated. Try again.'); return }
      setNewPassword(''); setConfirmPassword('')
      setSaved('password'); setTimeout(() => setSaved(''), 2000)
      fetch('/api/settings/notify-password-changed', { method: 'POST' }).catch(() => {})
    } catch {
      setError('Your password could not be updated. Try again.')
    } finally {
      setSaving(null)
    }
  }

  const inputClass = "w-full rounded-xl border border-[rgba(var(--line-rgb),0.1)] bg-[var(--overlay)] px-4 py-3 text-sm text-[var(--text-1)] outline-none transition placeholder:text-[var(--text-3)] focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"

  return (
    <div className="space-y-6">
      {error && <div role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--red)_25%,transparent)] bg-[color-mix(in_srgb,var(--red)_10%,transparent)] px-4 py-3 text-sm text-[var(--red)]">{error}</div>}
      <form className="ss-settings-card" onSubmit={updateEmail}>
        <h2 className="mb-3 font-semibold text-[var(--text-1)]">Email address</h2>
        <input type="email" aria-label="Email address" value={email} required maxLength={254} autoComplete="email" onChange={e => setEmail(e.target.value)} className={inputClass + ' mb-3'} />
        <button type="submit" disabled={saving !== null || !email.trim()} className="ss-settings-primary">
          {saved === 'email' ? <><Check size={13} /> Saved</> : saving === 'email' ? <><Loader2 size={13} className="animate-spin" /> Updating…</> : 'Update email'}
        </button>
      </form>
      <section className="ss-settings-card">
        <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[rgba(var(--line-rgb),0.08)] bg-[var(--surface)] text-[var(--accent)]"><Database size={17} /></span><div><h2 className="font-semibold text-[var(--text-1)]">Your data</h2><p className="mt-1 text-xs leading-5 text-[var(--text-3)]">Download a private copy of your account data.</p><DataExportControl /></div></div>
      </section>
      <form className="ss-settings-card" onSubmit={updatePassword}>
        <h2 className="mb-3 font-semibold text-[var(--text-1)]">Change password</h2>
        <div className="space-y-3">
          <input type="password" aria-label="New password" value={newPassword} minLength={8} maxLength={128} autoComplete="new-password" onChange={e => setNewPassword(e.target.value)} placeholder="New password" className={inputClass} />
          <input type="password" aria-label="Confirm new password" value={confirmPassword} minLength={8} maxLength={128} autoComplete="new-password" onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm new password" className={inputClass} />
        </div>
        <button type="submit" disabled={saving !== null || !newPassword} className="ss-settings-primary mt-3">
          {saved === 'password' ? <><Check size={13} /> Updated</> : saving === 'password' ? <><Loader2 size={13} className="animate-spin" /> Updating…</> : 'Change password'}
        </button>
      </form>
      <section className="ss-settings-card !border-[color-mix(in_srgb,var(--red)_20%,transparent)]">
        <h2 className="mb-2 font-semibold text-[var(--red)]">Delete account</h2>
        <p className="text-xs text-[var(--text-3)] mb-3">
          Permanently delete your account and all your data. This cannot be undone. We'll email you to confirm before anything is removed.
        </p>
        <AccountDeletionControl hasPaidTier={hasPaidTier} />
      </section>
    </div>
  )
}
