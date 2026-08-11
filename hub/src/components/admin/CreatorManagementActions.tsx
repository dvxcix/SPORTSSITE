'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pause, Play, ShieldOff } from 'lucide-react'
import { useFeedback } from '@/components/ui/FeedbackProvider'

type Props =
  | { kind: 'product'; id: string; status: string }
  | { kind: 'entitlement'; id: string; status: string }

export function CreatorManagementActions(props: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { confirm } = useFeedback()
  const productPaused = props.kind === 'product' && props.status === 'paused'
  const disabled = busy || (props.kind === 'entitlement' && props.status === 'revoked')

  async function act() {
    if (props.kind === 'entitlement' && !await confirm({ title: 'Revoke creator access?', message: 'This member will immediately lose access to the creator product.', confirmLabel: 'Revoke access', tone: 'error' })) return
    setBusy(true)
    setError('')
    const response = await fetch('/api/admin/creators/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(props.kind === 'product'
        ? { action: 'set_product_status', id: props.id, status: productPaused ? 'active' : 'paused' }
        : { action: 'revoke_entitlement', id: props.id }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) setError(payload.error || 'Action failed')
    else router.refresh()
    setBusy(false)
  }

  return <div style={{ display: 'grid', justifyItems: 'end', gap: 4 }}>
    <button type="button" onClick={act} disabled={disabled}>
      {props.kind === 'product' ? (productPaused ? <Play size={13} /> : <Pause size={13} />) : <ShieldOff size={13} />}
      {busy ? 'Working' : props.kind === 'product' ? (productPaused ? 'Resume' : 'Pause') : props.status === 'revoked' ? 'Revoked' : 'Revoke'}
    </button>
    {error && <small style={{ color: 'var(--red)' }}>{error}</small>}
  </div>
}
