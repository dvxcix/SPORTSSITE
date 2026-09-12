'use client'

import Link from 'next/link'
import { BadgeCheck } from 'lucide-react'
import { FollowButton } from './FollowButton'
import { UserBadges } from './UserBadges'
import { MemberAvatar } from './MemberAvatar'

export type SuggestedUser = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  avatar_ring_style?: 'none' | 'solid' | 'surge' | 'pulse' | 'orbit' | null
  avatar_ring_color?: string | null
  is_verified?: boolean
  account_type?: string
  tier?: 'free' | 'basic' | 'advanced' | 'ultimate'
  beta_access_active?: boolean
  follower_count?: number
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
    <div className="ss-suggested-users">
      {users.map(u => (
        <div key={u.id} className="ss-suggested-user">
          <Link href={`/profile/${u.username}`} className="shrink-0">
            <MemberAvatar src={u.avatar_url} name={u.display_name || u.username} size={42} tone={u.tier === 'ultimate' ? 'ultimate' : u.tier === 'advanced' ? 'advanced' : u.account_type === 'creator' ? 'creator' : 'default'} ringStyle={u.avatar_ring_style ?? undefined} ringColor={u.avatar_ring_color ?? undefined} />
          </Link>
          <div className="ss-suggested-copy">
            <div className="ss-suggested-name">
              <Link href={`/profile/${u.username}`} className="text-sm font-bold text-white hover:underline truncate">
                {u.display_name || u.username}
              </Link>
              {u.is_verified && <BadgeCheck size={14} aria-label="Verified" className="ss-suggested-verified" />}
              <UserBadges userId={u.id} size={16} maxVisible={2} />
            </div>
            <p>@{u.username}{typeof u.follower_count === 'number' ? ` · ${u.follower_count.toLocaleString()} followers` : ''}</p>
          </div>
          {currentUserId ? (
            <FollowButton currentUserId={currentUserId} targetUserId={u.id} initialFollowing={false} compact />
          ) : (
            <Link href="/auth/login"
              className="ss-follow-button is-compact is-follow">
              Follow
            </Link>
          )}
        </div>
      ))}
    </div>
  )
}
