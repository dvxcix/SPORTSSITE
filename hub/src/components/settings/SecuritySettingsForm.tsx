'use client'

/* eslint-disable @next/next/no-img-element -- The MFA QR code is a transient Supabase data URL, not a page image. */
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, KeyRound, LoaderCircle, LogOut, ShieldCheck, ShieldOff } from 'lucide-react'

type Factor = { id: string; friendly_name?: string; status: string; created_at: string }

export function SecuritySettingsForm() {
  const [supabase] = useState(() => createClient())
  const [factors, setFactors] = useState<Factor[]>([])
  const [enrollment, setEnrollment] = useState<{ id: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function loadFactors() {
    const { data } = await supabase.auth.mfa.listFactors()
    setFactors((data?.totp ?? []) as Factor[])
  }
  useEffect(() => {
    let active = true
    supabase.auth.mfa.listFactors().then(({ data }) => {
      if (active) setFactors((data?.totp ?? []) as Factor[])
    })
    return () => { active = false }
  }, [supabase.auth.mfa])

  async function beginEnrollment() {
    setBusy('enroll'); setError(''); setMessage('')
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'SlipSurge authenticator' })
    setBusy('')
    if (enrollError || !data) { setError(enrollError?.message ?? 'Could not start two-factor setup.'); return }
    setEnrollment({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
  }

  async function confirmEnrollment() {
    if (!enrollment || code.length !== 6) return
    setBusy('verify'); setError('')
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollment.id, code })
    setBusy('')
    if (verifyError) { setError('That code was not accepted. Try the newest code from your authenticator.'); return }
    setEnrollment(null); setCode(''); setMessage('Two-factor authentication is now active.'); await loadFactors()
  }

  async function removeFactor(id: string) {
    if (!window.confirm('Turn off two-factor authentication for this account?')) return
    setBusy(id); setError('')
    const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: id })
    setBusy('')
    if (removeError) { setError(removeError.message); return }
    setMessage('Two-factor authentication was removed.'); await loadFactors()
  }

  async function signOutOthers() {
    setBusy('others'); setError(''); setMessage('')
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'others' })
    setBusy('')
    if (signOutError) { setError(signOutError.message); return }
    setMessage('Other sessions have been signed out. Existing access tokens may remain valid briefly until they expire.')
  }

  const verified = factors.filter(f => f.status === 'verified')
  return <div className="space-y-5">
    {(message || error) && <div className={`rounded-2xl border px-4 py-3 text-sm ${error ? 'border-red-500/25 bg-red-500/10 text-red-300' : 'border-lime-400/20 bg-lime-400/10 text-lime-300'}`}>{error || message}</div>}
    <section className="ss-settings-card">
      <div className="flex items-start justify-between gap-4"><div className="flex gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-lime-400/20 bg-lime-400/10 text-lime-300"><ShieldCheck size={20} /></span><div><h2 className="font-black text-white">Two-factor authentication</h2><p className="mt-1 max-w-xl text-xs leading-5 text-zinc-500">Protect your account with a time-based code from an authenticator app. This is strongly recommended for creators and required for sensitive admin work.</p></div></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${verified.length ? 'bg-lime-400/10 text-lime-300' : 'bg-zinc-800 text-zinc-500'}`}>{verified.length ? 'Active' : 'Off'}</span></div>
      {verified.map(factor => <div key={factor.id} className="mt-4 flex items-center justify-between rounded-2xl border border-white/[.07] bg-black/25 p-4"><div><p className="text-sm font-bold text-white">{factor.friendly_name || 'Authenticator app'}</p><p className="mt-1 text-[11px] text-zinc-500">Added {new Date(factor.created_at).toLocaleDateString()}</p></div><button onClick={() => removeFactor(factor.id)} disabled={busy === factor.id} className="inline-flex items-center gap-2 rounded-xl border border-red-500/25 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/10 disabled:opacity-50"><ShieldOff size={14} />Remove</button></div>)}
      {!verified.length && !enrollment && <button onClick={beginEnrollment} disabled={busy === 'enroll'} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-lime-400 px-4 py-2.5 text-sm font-black text-black hover:bg-lime-300 disabled:opacity-50">{busy === 'enroll' ? <LoaderCircle size={15} className="animate-spin" /> : <KeyRound size={15} />}Set up authenticator</button>}
      {enrollment && <div className="mt-5 grid gap-5 rounded-3xl border border-lime-400/20 bg-black/30 p-5 md:grid-cols-[180px_1fr]"><div className="rounded-2xl bg-white p-3"><img src={enrollment.qr} alt="Authenticator QR code" className="aspect-square w-full" /></div><div><h3 className="font-black text-white">Scan, then verify</h3><ol className="mt-2 space-y-2 text-xs leading-5 text-zinc-400"><li>1. Scan the QR code with your authenticator app.</li><li>2. Enter the current six-digit code below.</li><li>3. Store the manual key somewhere secure in case you need it.</li></ol><code className="mt-3 block break-all rounded-xl bg-zinc-900 px-3 py-2 text-[11px] text-lime-300">{enrollment.secret}</code><div className="mt-3 flex gap-2"><input value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" aria-label="Six-digit authenticator code" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-center font-black tracking-[.25em] text-white outline-none focus:border-lime-400/40" /><button onClick={confirmEnrollment} disabled={busy === 'verify' || code.length !== 6} className="inline-flex items-center gap-2 rounded-xl bg-lime-400 px-4 py-2 text-xs font-black text-black disabled:opacity-40">{busy === 'verify' ? <LoaderCircle size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}Verify</button></div></div></div>}
    </section>
    <section className="ss-settings-card"><div className="flex items-start gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl border border-white/[.08] bg-black/25 text-lime-300"><LogOut size={19} /></span><div className="flex-1"><h2 className="font-black text-white">Active sessions</h2><p className="mt-1 text-xs leading-5 text-zinc-500">If you used a shared device or do not recognize a session, sign out every other device. This device stays signed in.</p><button onClick={signOutOthers} disabled={busy === 'others'} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-xs font-black text-zinc-200 hover:border-lime-400/25 hover:text-white disabled:opacity-50">{busy === 'others' && <LoaderCircle size={14} className="animate-spin" />}Sign out other devices</button></div></div></section>
  </div>
}
