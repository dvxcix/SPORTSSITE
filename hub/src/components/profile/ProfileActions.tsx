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
  return <button type="button" onClick={share} aria-label={`Share @${username}'s profile`} className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/[.1] bg-black/35 px-3 text-xs font-bold text-zinc-300 transition hover:border-lime-400/35 hover:text-white">
    {copied ? <Check size={14} className="text-lime-300" /> : <Share2 size={14} />}<span className="hidden sm:inline">{copied ? 'Copied' : 'Share'}</span>
  </button>
}
