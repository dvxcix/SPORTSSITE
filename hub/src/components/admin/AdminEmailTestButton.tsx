'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'

export function AdminEmailTestButton({ disabled = false }: { disabled?: boolean }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')

  async function sendTest() {
    setState('sending')
    const response = await fetch('/api/admin/email/test', { method: 'POST' }).catch(() => null)
    setState(response?.ok ? 'sent' : 'failed')
    window.setTimeout(() => setState('idle'), 3500)
  }

  const label = state === 'sending' ? 'Sending…' : state === 'sent' ? 'Test sent' : state === 'failed' ? 'Send failed' : 'Send me a test'
  return (
    <button type="button" onClick={sendTest} disabled={disabled || state === 'sending'} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border-accent)] bg-[var(--accent-muted)] px-4 text-xs font-black text-[var(--accent-primary)] transition hover:bg-[var(--accent-primary)] hover:text-black disabled:cursor-not-allowed disabled:opacity-45">
      <Send size={14} aria-hidden="true" /> {label}
    </button>
  )
}
