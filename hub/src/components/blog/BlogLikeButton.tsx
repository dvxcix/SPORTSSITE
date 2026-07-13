'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Heart } from 'lucide-react'

export function BlogLikeButton({ userId, blogId, likes }: { userId: string; blogId: string; likes: number }) {
  const [count, setCount] = useState(likes)
  const [liked, setLiked] = useState(false)
  const supabase = createClient()

  async function toggle() {
    const next = !liked
    const prevCount = count
    setLiked(next)
    setCount(c => next ? c + 1 : c - 1)
    const { error } = await supabase.from('blogs').update({ like_count: next ? count + 1 : count - 1 }).eq('id', blogId)
    if (error) { setLiked(!next); setCount(prevCount) }
  }

  return (
    <button onClick={toggle}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${
        liked ? 'border-red-500/50 text-red-400 bg-red-500/10' : 'border-zinc-700 text-zinc-400 hover:border-red-500/30 hover:text-red-400'
      }`}>
      <Heart size={13} className={liked ? 'fill-current' : ''} /> {count}
    </button>
  )
}
