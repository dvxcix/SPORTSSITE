'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react'

export function MfaGate() {
  const { user } = useAuth()
  const [supabase] = useState(() => createClient())
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [checking, setChecking] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function check() {
      if (!user) { if (active) { setFactorId(null); setChecking(false) }; return }
      const [{ data: assurance }, { data: factors }] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ])
      const verified = factors?.totp?.find(f => f.status === 'verified')
      if (active) {
        setFactorId(assurance?.currentLevel === 'aal1' && assurance?.nextLevel === 'aal2' ? verified?.id ?? null : null)
        setChecking(false)
      }
    }
    check()
    return () => { active = false }
  }, [supabase.auth.mfa, user])

  async function verify() {
    if (!factorId || code.length !== 6) return
    setVerifying(true); setError('')
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
    setVerifying(false)
    if (verifyError) { setError('That code was not accepted. Check your authenticator and try again.'); return }
    setFactorId(null); setCode('')
    const next = new URLSearchParams(window.location.search).get('next')
    if (next?.startsWith('/') && !next.startsWith('//')) window.location.assign(next)
  }

  if (checking || !factorId) return null

  return <div className="fixed inset-0 z-[10000] grid place-items-center bg-black/85 p-4 backdrop-blur-xl" role="dialog" aria-modal="true" aria-labelledby="mfa-gate-title">
    <div className="w-full max-w-md rounded-[28px] border border-lime-400/25 bg-zinc-950 p-6 shadow-[0_24px_100px_rgba(0,0,0,.75),0_0_60px_rgba(180,255,77,.08)]">
      <div className="mb-5 flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl border border-lime-400/25 bg-lime-400/10 text-lime-300"><ShieldCheck size={22} /></span><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-lime-300">Security check</p><h2 id="mfa-gate-title" className="text-xl font-black text-white">Enter your authenticator code</h2></div></div>
      <p className="mb-4 text-sm leading-6 text-zinc-400">Your account uses two-factor authentication. Enter the current six-digit code to continue.</p>
      <div className="relative"><KeyRound size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" /><input value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={event => { if (event.key === 'Enter') verify() }} inputMode="numeric" autoComplete="one-time-code" autoFocus aria-label="Six-digit authenticator code" className="w-full rounded-2xl border border-white/10 bg-black/40 py-3 pl-11 pr-4 text-center text-xl font-black tracking-[.35em] text-white outline-none focus:border-lime-400/50" /></div>
      {error && <p className="mt-3 text-xs font-semibold text-red-400">{error}</p>}
      <button onClick={verify} disabled={verifying || code.length !== 6} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-lime-400 px-4 py-3 text-sm font-black text-black transition hover:bg-lime-300 disabled:cursor-not-allowed disabled:opacity-40">{verifying && <LoaderCircle size={16} className="animate-spin" />}Verify and continue</button>
    </div>
  </div>
}
