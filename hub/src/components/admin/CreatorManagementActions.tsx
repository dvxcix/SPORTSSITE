'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pause, Play, RefreshCw, ShieldOff } from 'lucide-react'
import { useFeedback } from '@/components/ui/FeedbackProvider'

type Props =
  | { kind: 'product'; id: string; status: string }
  | { kind: 'entitlement'; id: string; status: string; held?: boolean }
  | { kind: 'creator'; id: string; status: string }

export function CreatorManagementActions(props: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { confirm, prompt } = useFeedback()
  const productPaused = props.kind === 'product' && props.status !== 'active'
  const disabled = busy || props.kind === 'product' && props.status === 'archived'

  async function act(closeLinks=false) {
    let reason: string | null = null
    if (props.kind === 'entitlement') {
      reason = await prompt({ title: props.held ? 'Review membership access' : 'Hold member access', message: props.held ? 'Restore access only if Whop confirms a current membership. Billing is unchanged.' : 'Access is blocked until an admin restores it. This does not cancel billing or refund payments.', label: 'Reason', placeholder: 'Explain the change for the audit log', multiline: true, confirmLabel: props.held ? 'Verify and restore' : 'Hold access' })
      if (reason == null) return
      if (reason.trim().length < 3 || reason.trim().length > 500) { setError('Enter a reason from 3 to 500 characters.'); return }
    }
    if (props.kind === 'product' && !await confirm({ title: productPaused&&!closeLinks ? 'Publish this offer?' : 'Pause new purchases?', message: productPaused&&!closeLinks ? 'Payment readiness and its member community will be checked before checkout opens.' : 'New purchases and existing checkout links will close. Current memberships continue.', confirmLabel: productPaused&&!closeLinks ? 'Verify and publish' : 'Pause purchases' })) return
    setBusy(true)
    setError('')
    try {
    const response = await fetch('/api/admin/creators/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(props.kind === 'product'
        ? { action: 'set_product_status', id: props.id, status: productPaused&&!closeLinks ? 'active' : 'paused' }
        : props.kind === 'creator' ? { action: 'check_creator', id: props.id } : { action: props.held ? 'restore_entitlement' : 'revoke_entitlement', id: props.id, reason }),
      signal: AbortSignal.timeout(30000),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) setError(payload.error || 'Action failed')
    else router.refresh()
    } catch { setError('The connection was interrupted. Refresh to check the current state before retrying.') }
    finally { setBusy(false) }
  }

  return <div style={{ display: 'grid', justifyItems: 'end', gap: 4 }}>
    <button type="button" onClick={()=>void act()} disabled={disabled} aria-busy={busy}>
      {props.kind === 'product' ? (productPaused ? <Play size={13} /> : <Pause size={13} />) : props.kind === 'creator' ? <RefreshCw size={13} /> : <ShieldOff size={13} />}
      {busy ? 'Working…' : props.kind === 'product' ? (productPaused ? 'Publish' : 'Pause') : props.kind === 'creator' ? 'Check Whop' : props.held ? 'Restore access' : 'Hold access'}
    </button>
    {props.kind==='product'&&props.status==='paused'&&<button type="button" disabled={busy} onClick={()=>void act(true)}>Verify closed links</button>}
    {error && <small role="alert" style={{ color: 'var(--red)', maxWidth: 280, overflowWrap: 'anywhere' }}>{error}</small>}
  </div>
}
