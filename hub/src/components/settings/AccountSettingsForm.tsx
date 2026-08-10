'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check, Database, KeyRound, Mail, ShieldCheck } from 'lucide-react'
import Link from 'next/link'

export function AccountSettingsForm({ profile }: { profile: any }) {
  const supabase = createClient()
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
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // No self-serve cascading delete yet (would need to unwind picks, posts,
  // active Stripe subscriptions, etc. safely) — routes the request to
  // support instead, matching what the Privacy Policy promises today.
  function requestDeletion() {
    const subject = encodeURIComponent('Account deletion request')
    const body = encodeURIComponent(`Please delete my SlipSurge account.\n\nAccount email: ${profile?.email ?? ''}`)
    window.location.href = `mailto:support@slipsurge.com?subject=${subject}&body=${body}`
  }

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

  const inputClass = "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 transition-all"

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/[.08] bg-white/[.025] p-4"><Mail size={17} className="mb-3 text-lime-300" /><p className="text-xs font-black text-white">Verified identity</p><p className="mt-1 truncate text-[11px] text-zinc-500">{profile?.email || 'Account email'}</p></div>
        <div className="rounded-2xl border border-white/[.08] bg-white/[.025] p-4"><KeyRound size={17} className="mb-3 text-lime-300" /><p className="text-xs font-black text-white">Password access</p><p className="mt-1 text-[11px] text-zinc-500">Change it securely below</p></div>
        <div className="rounded-2xl border border-white/[.08] bg-white/[.025] p-4"><ShieldCheck size={17} className="mb-3 text-lime-300" /><p className="text-xs font-black text-white">Privacy controls</p><p className="mt-1 text-[11px] text-zinc-500">Manage visibility and messages</p></div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="font-bold text-white mb-3">Email Address</h3>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass + ' mb-3'} />
        <button onClick={updateEmail} disabled={saving} className="flex items-center gap-2 bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black px-4 py-2 rounded-xl text-sm transition-colors">
          {saved === 'email' ? <><Check size={13} /> Saved!</> : 'Update Email'}
        </button>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[.08] bg-black/25 text-lime-300"><Database size={17} /></span><div><h3 className="font-bold text-white">Your data</h3><p className="mt-1 text-xs leading-5 text-zinc-500">Request a portable copy of your profile and account data. Our support team verifies requests before sending an export.</p><a href={`mailto:support@slipsurge.com?subject=${encodeURIComponent('Account data export request')}&body=${encodeURIComponent(`Please send me a copy of my SlipSurge account data.\n\nAccount email: ${profile?.email ?? ''}`)}`} className="mt-3 inline-flex rounded-xl border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-200 hover:border-lime-400/35 hover:text-white">Request data export</a></div></div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="font-bold text-white mb-3">Change Password</h3>
        <div className="space-y-3">
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password" className={inputClass} />
          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm new password" className={inputClass} />
        </div>
        <button onClick={updatePassword} disabled={saving || !newPassword} className="mt-3 flex items-center gap-2 bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black px-4 py-2 rounded-xl text-sm transition-colors">
          {saved === 'password' ? <><Check size={13} /> Updated!</> : 'Change Password'}
        </button>
      </div>
      <div className="bg-zinc-900 border border-red-500/20 rounded-xl p-4">
        <h3 className="font-bold text-red-400 mb-2">Danger Zone</h3>
        <p className="text-xs text-zinc-500 mb-3">
          Permanently delete your account and all your data. This cannot be undone. We'll email you to confirm before anything is removed.
        </p>
        {hasPaidTier && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 text-xs text-yellow-400 mb-3">
            <strong>Deleting your account does not cancel your subscription or trial.</strong> Billing runs through Whop, separately from your SlipSurge account — you'll keep being charged even after your account is deleted unless you cancel it first. Cancel it from{' '}
            <Link href="/settings/membership" className="underline hover:text-yellow-300">Membership settings</Link>, or directly on{' '}
            <a href="https://whop.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-yellow-300">whop.com</a>, before deleting your account.
          </div>
        )}
        {confirmingDelete ? (
          <div className="flex items-center gap-2">
            <button onClick={requestDeletion} className="bg-red-500 hover:bg-red-400 text-black font-black px-4 py-2 rounded-xl text-sm transition-colors">
              Yes, email support to delete my account
            </button>
            <button onClick={() => setConfirmingDelete(false)} className="text-zinc-400 hover:text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors">
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmingDelete(true)} className="border border-red-500/50 text-red-400 hover:bg-red-500/10 font-bold px-4 py-2 rounded-xl text-sm transition-colors">
            Delete Account
          </button>
        )}
      </div>
    </div>
  )
}
