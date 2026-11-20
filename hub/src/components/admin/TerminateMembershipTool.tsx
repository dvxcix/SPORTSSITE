'use client'

import { useState } from 'react'

export function TerminateMembershipTool() {
  const [membershipId, setMembershipId] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState('')
  const [isError, setIsError] = useState(false)

  async function run() {
    setRunning(true)
    setResult('')
    setIsError(false)
    try {
      const res = await fetch('/api/admin/whop/terminate-membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ membershipId: membershipId.trim() }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Termination failed')
      setResult(
        body.matchedAccountId
          ? `Terminated (${body.business} business) — linked SlipSurge account downgraded to Free.`
          : `Terminated (${body.business} business) — no SlipSurge account has this membership ID on file.`
      )
    } catch (e: unknown) {
      setIsError(true)
      setResult(e instanceof Error ? e.message : 'Termination failed')
    } finally {
      setRunning(false)
      setConfirming(false)
    }
  }

  return (
    <div className="bg-[var(--surface)] border border-[color-mix(in_srgb,var(--red)_20%,transparent)] rounded-xl p-4 mb-4 space-y-3">
      <p className="text-xs font-bold text-[var(--red)] uppercase tracking-wider">Force-terminate a Whop membership</p>
      <p className="text-xs text-[var(--text-3)]">
        Cancels immediately (not at period end) by raw Whop membership ID — works against either business, and
        does not require the membership to be linked to a SlipSurge account. For ToS violations, fraud, or chargebacks.
      </p>
      <div className="flex items-center gap-2">
        <input
          value={membershipId}
          onChange={e => { setMembershipId(e.target.value); setConfirming(false); setResult('') }}
          placeholder="mem_xxxxxxxxxxxxxx"
          className="flex-1 bg-[var(--surface-2)] border border-[var(--border-2)] rounded-lg px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] outline-none focus:border-[color-mix(in_srgb,var(--red)_50%,transparent)] font-mono"
        />
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            disabled={!membershipId.trim() || running}
            className="bg-[color-mix(in_srgb,var(--red)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--red)_20%,transparent)] disabled:opacity-40 text-[var(--red)] font-bold px-4 py-2 rounded-lg text-sm transition-colors border border-[color-mix(in_srgb,var(--red)_30%,transparent)] whitespace-nowrap"
          >
            Terminate
          </button>
        ) : (
          <button
            onClick={run}
            disabled={running}
            className="bg-[var(--red-fill)] hover:bg-[var(--red-fill)] disabled:opacity-40 text-[var(--accent-fg)] font-semibold px-4 py-2 rounded-lg text-sm transition-colors whitespace-nowrap"
          >
            {running ? 'Terminating…' : 'Confirm — cancel now'}
          </button>
        )}
      </div>
      {result && <p className={`text-xs ${isError ? 'text-[var(--red)]' : 'text-[var(--green)]'}`}>{result}</p>}
    </div>
  )
}
