'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const QUICK_REACTIONS = ['🔥', '👍', '💡', '👀'] as const

export type ForumReaction = {
  emoji: string
  user_id: string | null
}

export function ForumReactions({
  targetId,
  targetType,
  userId,
  initialReactions,
  returnPath,
}: {
  targetId: string
  targetType: 'forum_thread' | 'forum_reply'
  userId?: string
  initialReactions: ForumReaction[]
  returnPath: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const [reactions, setReactions] = useState(initialReactions)
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState('')

  const counts = reactions.reduce<Record<string, number>>((summary, reaction) => {
    summary[reaction.emoji] = (summary[reaction.emoji] ?? 0) + 1
    return summary
  }, {})

  async function toggle(emoji: string) {
    if (!userId || pending) return
    const mine = reactions.some(reaction => reaction.emoji === emoji && reaction.user_id === userId)
    const previous = reactions
    setPending(emoji)
    setError('')
    setReactions(current => mine
      ? current.filter(reaction => !(reaction.emoji === emoji && reaction.user_id === userId))
      : [...current, { emoji, user_id: userId }])

    const { error: requestError } = mine
      ? await supabase.from('reactions').delete().match({ user_id: userId, target_id: targetId, target_type: targetType, emoji })
      : await supabase.from('reactions').insert({ user_id: userId, target_id: targetId, target_type: targetType, emoji })

    if (requestError) {
      setReactions(previous)
      setError('Could not update reaction.')
    }
    setPending(null)
  }

  return (
    <div className="ss-forum-reactions">
      <div>
        {QUICK_REACTIONS.map(emoji => {
          const count = counts[emoji] ?? 0
          const mine = reactions.some(reaction => reaction.emoji === emoji && reaction.user_id === userId)
          if (!userId && count === 0) return null
          return (
            <button
              key={emoji}
              type="button"
              className={`ss-reaction-pill${mine ? ' is-active' : ''}`}
              disabled={!userId || pending !== null}
              onClick={() => toggle(emoji)}
              aria-label={`${mine ? 'Remove' : 'Add'} ${emoji} reaction`}
            >
              <span>{emoji}</span>{count > 0 && <strong>{count}</strong>}
            </button>
          )
        })}
        {!userId && Object.keys(counts).length === 0 && (
          <Link href={`/auth/login?next=${encodeURIComponent(returnPath)}`}>Sign in to react</Link>
        )}
      </div>
      {error && <button type="button" onClick={() => setError('')} className="ss-forum-reaction-error">{error}</button>}
    </div>
  )
}
