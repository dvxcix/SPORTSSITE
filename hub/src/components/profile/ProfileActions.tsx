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
  return <button type="button" onClick={share} aria-label={`Share @${username}'s profile`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[.1] bg-black/45 px-3.5 text-xs font-black text-zinc-300 shadow-[inset_0_1px_rgba(255,255,255,.05),0_8px_24px_rgba(0,0,0,.18)] backdrop-blur-xl transition duration-200 hover:-translate-y-px hover:border-lime-400/35 hover:bg-lime-400/[.07] hover:text-white active:scale-[.98]">
    {copied ? <Check size={14} className="text-lime-300" /> : <Share2 size={14} />}<span className="hidden sm:inline">{copied ? 'Copied' : 'Share'}</span>
  </button>
}
