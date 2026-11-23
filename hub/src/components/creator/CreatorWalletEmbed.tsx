'use client'

import { useCallback, useEffect, useState } from 'react'
import { loadWhop } from '@whop/elements'
import { WhopElements, Wallet, WithdrawElement, Verifications, KycElement, RfiElement } from '@whop/elements-react'
import { Loader2, LockKeyhole, RefreshCw } from 'lucide-react'
import { useTheme } from '@/components/theme/ThemeProvider'
import type { CreatorWalletSession } from '@/lib/creatorWallet'
import styles from './creatorWallet.module.css'

let elements: ReturnType<typeof loadWhop> | undefined
export function CreatorWalletEmbed({ intent, currency, onChanged, onVerify }: { intent: 'withdraw' | 'verification'; currency: string; onChanged: () => void; onVerify: () => void }) {
  const { theme } = useTheme()
  const [session, setSession] = useState<CreatorWalletSession | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [kind, setKind] = useState<'individual' | 'business'>('individual')
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/creator/wallet/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ intent }), signal: controller.signal, cache: 'no-store' }).then(async response => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'The secure form could not be opened.')
      if (!controller.signal.aborted) setSession(data)
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'The secure form could not be opened.') })
    return () => controller.abort()
  }, [intent, attempt])
  useEffect(() => {
    if (!session) return
    const timer = setTimeout(() => { setSession(null); setError('Your secure session expired. Open a new session to continue.') }, Math.max(0, Date.parse(session.expiresAt) - Date.now()))
    return () => clearTimeout(timer)
  }, [session])
  const getToken = useCallback(async () => {
    if (!session || Date.parse(session.expiresAt) <= Date.now()) throw new Error('Session expired')
    return session.token
  }, [session])
  const failed = () => setError('The secure form is temporarily unavailable. Please try again.')
  elements ??= loadWhop()
  if (error) return <div className={styles.embedState}><LockKeyhole size={24}/><p role="alert">{error}</p><button className={styles.secondary} onClick={() => { setSession(null); setError(''); setAttempt(value => value + 1) }}><RefreshCw size={15}/> Try again</button></div>
  if (!session) return <div className={styles.embedState} role="status"><Loader2 className="animate-spin" size={22}/> Opening secure session…</div>
  return <div className={styles.embed}>
    {intent === 'verification' && <label className={styles.verificationKind}>Verify as<select value={kind} onChange={event => setKind(event.target.value as 'individual' | 'business')}><option value="individual">An individual</option><option value="business">A registered business</option></select></label>}
    <WhopElements elements={elements} appearance={{ theme: { appearance: theme, accentColor: 'lime' } }} onLoadError={failed}>
      {intent === 'withdraw' ? <Wallet accountId={session.accountId} accessToken={session.token} currency={currency} analytics={false} onIdentityVerificationRequested={onVerify}><WithdrawElement onDone={onChanged} onWithdrawalRequested={onChanged} onError={failed}/></Wallet> : <Verifications key={kind} accountId={session.accountId} getToken={getToken} kind={kind} analytics={false}><KycElement onCompleted={onChanged} onError={failed} onLoadFailed={failed}/><RfiElement onError={failed}/></Verifications>}
    </WhopElements>
    <p className={styles.secure}><LockKeyhole size={12}/> Secure financial services by Whop</p>
  </div>
}
