'use client'

import { useState } from 'react'
import { Check, Share2 } from 'lucide-react'

export function ProfileActions({ username }: { username: string }) {
  const [copied, setCopied] = useState(false)
  async function share() {
    const url = `${window.location.origin}/profile/${username}`
    if (navigator.share) {
      await navigator.share({ title: `@${username} on SlipSurge`, url }).catch(() => {})
      return
    }
    await navigator.clipboard.writeText(url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }
  return <button type="button" onClick={share} aria-label={`Share @${username}'s profile`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[rgba(var(--line-rgb),0.1)] bg-[var(--surface-2)] px-3.5 text-xs font-semibold text-[var(--text-2)] shadow-[inset_0_1px_rgba(255,255,255,.05),0_8px_24px_rgba(0,0,0,.18)] backdrop-blur-xl transition duration-200 hover:-translate-y-px hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_7.000000000000001%,transparent)] hover:text-[var(--text-1)] active:scale-[.98]">
    {copied ? <Check size={14} className="text-[var(--accent)]" /> : <Share2 size={14} />}<span className="hidden sm:inline">{copied ? 'Copied' : 'Share'}</span>
  </button>
}
