'use client'

import { useState } from 'react'
import { Heart } from 'lucide-react'

export function BlogLikeButton({ blogId, likes, initialLiked = false }: { blogId: string; likes: number; initialLiked?: boolean }) {
  const [count, setCount] = useState(likes)
  const [liked, setLiked] = useState(initialLiked)
  const [busy, setBusy] = useState(false)

  async function toggle() {
    if (busy) return
    setBusy(true)
    const next = !liked
    const prevCount = count
    setLiked(next)
    setCount(c => next ? c + 1 : c - 1)
    try {
      const response = await fetch(`/api/blogs/${blogId}/like`, { method: 'POST' })
      if (!response.ok) throw new Error('Reaction failed')
      const result = await response.json() as { liked?: boolean; count?: number }
      if (typeof result.liked === 'boolean') setLiked(result.liked)
      if (typeof result.count === 'number') setCount(result.count)
    } catch {
      setLiked(!next); setCount(prevCount)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button onClick={toggle} disabled={busy} aria-pressed={liked} aria-label={liked ? 'Unlike article' : 'Like article'}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${
        liked ? 'border-red-500/50 text-red-400 bg-red-500/10' : 'border-zinc-700 text-zinc-400 hover:border-red-500/30 hover:text-red-400'
      } disabled:opacity-60`}>
      <Heart size={13} className={liked ? 'fill-current' : ''} /> {count}
    </button>
  )
}
