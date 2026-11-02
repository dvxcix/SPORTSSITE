'use client'

import { useState, type FormEvent } from 'react'

export default function RenewalShapeForm() {
  const [targetUserId, setTargetUserId] = useState('')
  const [expectedPlanId, setExpectedPlanId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<Record<string, boolean> | null>(null)

  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setMessage('')
    setResult(null)
    try {
      const response = await fetch('/api/admin/whop-renewal-shape', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: targetUserId.trim(), expectedPlanId: expectedPlanId.trim() }),
      })
      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok || !payload || typeof payload !== 'object' || Array.isArray(payload)
        || Object.values(payload).some(value => typeof value !== 'boolean')) throw new Error('Unavailable')
      setResult(payload as Record<string, boolean>)
    } catch {
      setMessage('Could not verify this membership. Check the details and try again.')
    } finally { setBusy(false) }
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-8 text-white">
      <h1 className="text-2xl font-semibold">Billing verification</h1>
      <form onSubmit={inspect} className="mt-6 grid gap-4">
        <label className="grid gap-2">Account ID
          <input required autoComplete="off" value={targetUserId} onChange={event => setTargetUserId(event.target.value)} className="rounded border border-zinc-600 bg-zinc-950 px-3 py-2" />
        </label>
        <label className="grid gap-2">Expected plan ID
          <input required autoComplete="off" value={expectedPlanId} onChange={event => setExpectedPlanId(event.target.value)} className="rounded border border-zinc-600 bg-zinc-950 px-3 py-2" />
        </label>
        <button type="submit" disabled={busy} className="w-fit rounded bg-white px-4 py-2 font-medium text-black disabled:opacity-50">{busy ? 'Checking…' : 'Check membership'}</button>
      </form>
      {message && <p role="alert" className="mt-5 text-red-300">{message}</p>}
      {result && <dl aria-label="Verification results" className="mt-6 grid gap-2">{Object.entries(result).map(([label, value]) => <div key={label} className="flex justify-between gap-4 border-b border-zinc-800 py-2"><dt>{label.replace(/([a-z0-9])([A-Z])/g, '$1 $2')}</dt><dd>{value ? 'Confirmed' : 'Not confirmed'}</dd></div>)}</dl>}
    </section>
  )
}
