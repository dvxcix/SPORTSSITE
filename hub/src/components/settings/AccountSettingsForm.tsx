'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check, Database, KeyRound, Mail, ShieldCheck } from 'lucide-react'
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
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')

  async function updateEmail() {
    setSaving(true); setError('')
    const { error: err } = await supabase.auth.updateUser({ email: email.trim() })
    if (err) { setError(err.message); setSaving(false); return }
    setSaved('email'); setTimeout(() => setSaved(''), 2000); setSaving(false)
  }

  async function updatePassword() {
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.auth.updateUser({ password: newPassword })
    if (err) { setError(err.message); setSaving(false); return }
    setNewPassword(''); setConfirmPassword('')
    setSaved('password'); setTimeout(() => setSaved(''), 2000); setSaving(false)
    // Supabase has no built-in email for this (only for the forgot-password
    // flow, not an in-app change) — fire our own security alert. Best-effort:
    // never blocks or fails the password change itself if this errors.
    fetch('/api/settings/notify-password-changed', { method: 'POST' }).catch(() => {})
  }

  const inputClass = "w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-lime-400/50"

  return (
    <div className="space-y-6">
      {error && <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/[.08] bg-white/[.025] p-4"><Mail size={17} className="mb-3 text-lime-300" /><p className="text-xs font-black text-white">Verified identity</p><p className="mt-1 truncate text-[11px] text-zinc-500">{profile?.email || 'Account email'}</p></div>
        <div className="rounded-2xl border border-white/[.08] bg-white/[.025] p-4"><KeyRound size={17} className="mb-3 text-lime-300" /><p className="text-xs font-black text-white">Password access</p><p className="mt-1 text-[11px] text-zinc-500">Change it securely below</p></div>
        <div className="rounded-2xl border border-white/[.08] bg-white/[.025] p-4"><ShieldCheck size={17} className="mb-3 text-lime-300" /><p className="text-xs font-black text-white">Privacy controls</p><p className="mt-1 text-[11px] text-zinc-500">Manage visibility and messages</p></div>
      </div>
      <section className="ss-settings-card">
        <h2 className="mb-3 font-black text-white">Email address</h2>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass + ' mb-3'} />
        <button onClick={updateEmail} disabled={saving} className="ss-settings-primary">
          {saved === 'email' ? <><Check size={13} /> Saved</> : 'Update email'}
        </button>
      </section>
      <section className="ss-settings-card">
        <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[.08] bg-black/25 text-lime-300"><Database size={17} /></span><div><h2 className="font-black text-white">Your data</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Download a private copy of your account data.</p><DataExportControl /></div></div>
      </section>
      <section className="ss-settings-card">
        <h2 className="mb-3 font-black text-white">Change password</h2>
        <div className="space-y-3">
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password" className={inputClass} />
          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm new password" className={inputClass} />
        </div>
        <button onClick={updatePassword} disabled={saving || !newPassword} className="ss-settings-primary mt-3">
          {saved === 'password' ? <><Check size={13} /> Updated</> : 'Change password'}
        </button>
      </section>
      <section className="ss-settings-card !border-red-500/20">
        <h2 className="mb-2 font-black text-red-400">Delete account</h2>
        <p className="text-xs text-zinc-500 mb-3">
          Permanently delete your account and all your data. This cannot be undone. We'll email you to confirm before anything is removed.
        </p>
        <AccountDeletionControl hasPaidTier={hasPaidTier} />
      </section>
    </div>
  )
}
