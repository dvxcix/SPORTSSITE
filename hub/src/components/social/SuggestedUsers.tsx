'use client'

import Link from 'next/link'
import { FollowButton } from './FollowButton'

export type SuggestedUser = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  is_verified?: boolean
  account_type?: string
}

// Shared "who to follow" list — used in RightSidebar, onboarding's Follow
// step, and the Feed empty state, all against the real FollowButton instead
// of each spot reinventing its own (RightSidebar's old version was just a
// <Link> styled to look like a Follow button, not an actual follow action).
export function SuggestedUsers({ users, currentUserId }: {
  users: SuggestedUser[]
  currentUserId: string | null
}) {
  if (!users.length) return null

  return (
    <div className="space-y-3">
      {users.map(u => (
        <div key={u.id} className="flex items-center gap-3">
          <Link href={`/profile/${u.username}`} className="shrink-0">
            <div className="w-10 h-10 rounded-full bg-zinc-700 overflow-hidden flex items-center justify-center text-sm font-black text-white">
              {u.avatar_url
                ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                : (u.display_name || u.username)[0]?.toUpperCase()
              }
            </div>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <Link href={`/profile/${u.username}`} className="text-sm font-bold text-white hover:underline truncate">
                {u.display_name || u.username}
              </Link>
              {u.is_verified && <span className="text-green-400 text-xs shrink-0">✓</span>}
              {u.account_type === 'creator' && (
                <span className="text-[9px] font-black text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full shrink-0">CAPPER</span>
              )}
            </div>
            <p className="text-xs text-zinc-500 truncate">@{u.username}</p>
          </div>
          {currentUserId ? (
            <FollowButton currentUserId={currentUserId} targetUserId={u.id} initialFollowing={false} />
          ) : (
            <Link href="/auth/login"
              className="text-xs font-bold text-white bg-zinc-700 hover:bg-zinc-600 px-3 py-1.5 rounded-xl transition-colors shrink-0">
              Follow
            </Link>
          )}
        </div>
      ))}
    </div>
  )
}
