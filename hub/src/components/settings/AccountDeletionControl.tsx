'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react'

type DeletionRequest = { id: string; status: string; requested_at: string; scheduled_for: string | null; resolution_note: string | null }

export function AccountDeletionControl({ hasPaidTier }: { hasPaidTier: boolean }) {
  const [current, setCurrent] = useState<DeletionRequest | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/account/deletion', { cache: 'no-store' }).then(response => response.json()).then(body => {
      const open = (body.requests ?? []).find((row: DeletionRequest) => ['pending', 'reviewing', 'scheduled', 'blocked'].includes(row.status))
      setCurrent(open ?? null)
    }).catch(() => setError('Deletion status could not be loaded.')).finally(() => setLoading(false))
  }, [])

  async function submit() {
    setSubmitting(true); setError('')
    const response = await fetch('/api/account/deletion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation, reason }) })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) setError(body.error || 'Request could not be submitted.')
    else setCurrent(body.request)
    setSubmitting(false)
  }

  async function cancel() {
    setSubmitting(true); setError('')
    const response = await fetch('/api/account/deletion', { method: 'DELETE' })
    if (!response.ok) setError('Request could not be canceled.')
    else { setCurrent(null); setConfirmation(''); setReason('') }
    setSubmitting(false)
  }

  if (loading) return <div className="flex items-center gap-2 text-xs text-[var(--text-3)]"><Loader2 size={13} className="animate-spin" /> Loading request status</div>
  if (current) return (
    <div className="rounded-xl border border-[color-mix(in_srgb,var(--gold)_25%,transparent)] bg-[color-mix(in_srgb,var(--gold)_10%,transparent)] p-4">
      <div className="flex items-start gap-3"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[var(--gold)]" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[var(--gold)]">Deletion request {current.status}</p><p className="mt-1 text-xs text-[color-mix(in_srgb,var(--gold)_70%,transparent)]">Requested {new Date(current.requested_at).toLocaleString()}. We review active billing, creator payouts, and legal retention requirements before removal.</p>{current.resolution_note ? <p className="mt-2 text-xs text-[var(--gold)]">{current.resolution_note}</p> : null}</div></div>
      {current.status !== 'scheduled' ? <button type="button" onClick={cancel} disabled={submitting} className="mt-3 flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--gold)_30%,transparent)] px-3 py-2 text-xs font-semibold text-[var(--gold)] hover:bg-[color-mix(in_srgb,var(--gold)_10%,transparent)] disabled:opacity-50"><X size={13} /> Cancel request</button> : null}
      {error ? <p role="alert" className="mt-2 text-xs text-[var(--red)]">{error}</p> : null}
    </div>
  )

  return (
    <div className="space-y-3">
      {hasPaidTier ? <div className="flex gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-xs leading-5 text-yellow-300"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span>Cancel your Whop membership first. A deletion request does not stop subscription billing.</span></div> : null}
      <textarea aria-label="Reason for leaving" value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} placeholder="Optional: tell us why you are leaving" className="ss-input min-h-20 resize-y text-sm" />
      <label className="block text-xs font-bold text-[var(--text-2)]">Type <strong className="text-[var(--red)]">DELETE</strong> to confirm<input value={confirmation} onChange={event => setConfirmation(event.target.value)} className="ss-input mt-1 h-10 text-sm" /></label>
      <button type="button" onClick={submit} disabled={submitting || confirmation !== 'DELETE'} className="rounded-xl bg-[var(--red-fill)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-fg)] transition-colors hover:bg-[var(--red-fill)] disabled:cursor-not-allowed disabled:opacity-40">{submitting ? 'Submitting…' : 'Request account deletion'}</button>
      {error ? <p role="alert" className="text-xs text-[var(--red)]">{error}</p> : null}
    </div>
  )
}
