'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function PageFollowButton({ userId, pageId, initialFollowing }: {
  userId: string; pageId: string; initialFollowing: boolean
}) {
  const [following, setFollowing] = useState(initialFollowing)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  async function toggle() {
    if (loading) return
    setLoading(true)
    setError(false)
    try {
      const { error: writeError } = following
        ? await supabase.from('page_follows').delete().match({ user_id: userId, page_id: pageId })
        : await supabase.from('page_follows').insert({ user_id: userId, page_id: pageId })
      if (writeError && writeError.code !== '23505') { setError(true); return }
      setFollowing(value => !value)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid justify-items-end gap-1">
      <button type="button" onClick={toggle} disabled={loading} aria-pressed={following}
        className={`h-9 px-4 text-sm rounded-xl font-black transition-all disabled:opacity-60 ${
          following ? 'border border-zinc-700 text-zinc-300 hover:border-red-500/50 hover:text-red-400' : 'bg-green-500 hover:bg-green-400 text-black'
        }`}>
        {loading ? 'Saving…' : following ? 'Following' : 'Follow'}
      </button>
      {error && <button type="button" onClick={toggle} className="text-[10px] font-bold text-red-400" role="alert">Not saved · retry</button>}
    </div>
  )
}
