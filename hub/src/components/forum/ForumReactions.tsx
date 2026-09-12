'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowBigDown, ArrowBigUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/lib/notify'

const QUICK_REACTIONS = ['🔥', '👍', '💡', '👀'] as const
const UPVOTE = '⬆️'
const DOWNVOTE = '⬇️'

export type ForumReaction = {
  emoji: string
  user_id: string | null
}

export function ForumReactions({
  targetId,
  targetType,
  userId,
  ownerId,
  initialReactions,
  returnPath,
}: {
  targetId: string
  targetType: 'forum_thread' | 'forum_reply'
  userId?: string
  ownerId: string
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
    const isVote = emoji === UPVOTE || emoji === DOWNVOTE
    const opposite = emoji === UPVOTE ? DOWNVOTE : UPVOTE
    const hadOpposite = isVote && reactions.some(reaction => reaction.emoji === opposite && reaction.user_id === userId)
    setReactions(current => {
      const withoutCurrent = current.filter(reaction => !(reaction.user_id === userId && (reaction.emoji === emoji || (isVote && reaction.emoji === opposite))))
      return mine ? withoutCurrent : [...withoutCurrent, { emoji, user_id: userId }]
    })

    let requestError = null
    if (isVote) {
      const { error: removeError } = await supabase.from('reactions').delete().match({ user_id: userId, target_id: targetId, target_type: targetType, emoji: opposite })
      requestError = removeError
    }
    if (!requestError) {
      const result = mine
        ? await supabase.from('reactions').delete().match({ user_id: userId, target_id: targetId, target_type: targetType, emoji })
        : await supabase.from('reactions').insert({ user_id: userId, target_id: targetId, target_type: targetType, emoji })
      requestError = result.error
    }

    if (requestError) {
      setReactions(previous)
      if (hadOpposite) {
        await supabase.from('reactions').insert({ user_id: userId, target_id: targetId, target_type: targetType, emoji: opposite })
      }
      setError('Could not update reaction.')
    } else if (!mine && emoji !== DOWNVOTE) {
      await notify(supabase, {
        userId: ownerId,
        actorId: userId,
        type: 'reaction',
        message: `reacted ${emoji} to your discussion`,
        link: returnPath,
        targetId,
        targetType,
        data: { emoji },
      })
    }
    setPending(null)
  }

  return (
    <div className="ss-forum-reactions">
      <div>
        <div className="ss-forum-vote" aria-label="Discussion score">
          <button type="button" disabled={!userId || pending !== null} className={reactions.some(reaction => reaction.emoji === UPVOTE && reaction.user_id === userId) ? 'is-active' : ''} onClick={() => toggle(UPVOTE)} aria-label="Upvote"><ArrowBigUp size={16}/></button>
          <strong>{(counts[UPVOTE] ?? 0) - (counts[DOWNVOTE] ?? 0)}</strong>
          <button type="button" disabled={!userId || pending !== null} className={reactions.some(reaction => reaction.emoji === DOWNVOTE && reaction.user_id === userId) ? 'is-active is-down' : ''} onClick={() => toggle(DOWNVOTE)} aria-label="Downvote"><ArrowBigDown size={16}/></button>
        </div>
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
