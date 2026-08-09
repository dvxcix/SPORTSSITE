'use client'

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { UserBadges } from './UserBadges'

export type MentionProfile = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  is_verified: boolean
  follower_count: number | null
  pick_record: { wins?: number; losses?: number; pushes?: number } | null
}

export function MentionProfileCard({ profile }: { profile: MentionProfile }) {
  return <div className="ss-mention-profile-card">
    <div className="ss-mention-profile-top">
      <span className="ss-mention-profile-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : (profile.display_name || profile.username)[0].toUpperCase()}</span>
      <span className="ss-mention-profile-id"><strong>{profile.display_name || profile.username}{profile.is_verified ? <i aria-label="Verified">&#10003;</i> : null}</strong><small>@{profile.username}</small></span>
      <UserBadges userId={profile.id} size={18} maxVisible={3} />
    </div>
    {profile.bio ? <p>{profile.bio}</p> : null}
    <div className="ss-mention-profile-stats"><span><strong>{profile.follower_count ?? 0}</strong> followers</span><span><strong>{profile.pick_record?.wins ?? 0}-{profile.pick_record?.losses ?? 0}</strong> record</span></div>
    <div className="ss-mention-profile-open">View profile</div>
  </div>
}

export function MentionHoverLink({ profile }: { profile: MentionProfile }) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })

  function show() {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const width = 292
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
    const top = rect.bottom + 200 > window.innerHeight ? Math.max(8, rect.top - 190) : rect.bottom + 10
    setPosition({ left, top })
    setVisible(true)
  }

  return <span ref={triggerRef} className="ss-mention-tooltip-trigger" onMouseEnter={show} onMouseLeave={() => setVisible(false)} onFocus={show} onBlur={() => setVisible(false)}>
    <Link href={`/profile/${profile.username}`} onClick={event => event.stopPropagation()} className="ss-mention-link">@{profile.username}</Link>
    {visible ? createPortal(<div className="ss-mention-profile-popover" style={position}><MentionProfileCard profile={profile} /></div>, document.body) : null}
  </span>
}
