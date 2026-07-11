'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check } from 'lucide-react'

export function AccountSettingsForm({ profile }: { profile: any }) {
  const supabase = createClient()
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
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.auth.updateUser({ password: newPassword })
    if (err) { setError(err.message); setSaving(false); return }
    setNewPassword(''); setConfirmPassword('')
    setSaved('password'); setTimeout(() => setSaved(''), 2000); setSaving(false)
  }

  const inputClass = "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 transition-all"

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="font-bold text-white mb-3">Email Address</h3>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass + ' mb-3'} />
        <button onClick={updateEmail} disabled={saving} className="flex items-center gap-2 bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black px-4 py-2 rounded-xl text-sm transition-colors">
          {saved === 'email' ? <><Check size={13} /> Saved!</> : 'Update Email'}
        </button>
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
