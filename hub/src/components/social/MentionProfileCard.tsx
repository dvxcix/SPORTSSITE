'use client'

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { UserBadges } from './UserBadges'
import { MemberAvatar } from './MemberAvatar'
import { FloatingSurface } from '@/components/ui/FloatingSurface'

export type MentionProfile = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  avatar_ring_style?: 'none' | 'solid' | 'surge' | 'pulse' | 'orbit' | null
  avatar_ring_color?: string | null
  bio: string | null
  is_verified: boolean
  follower_count: number | null
  pick_record: { wins?: number; losses?: number; pushes?: number } | null
}

export function MentionProfileCard({ profile }: { profile: MentionProfile }) {
  return <div className="ss-mention-profile-card">
    <div className="ss-mention-profile-top">
      <MemberAvatar src={profile.avatar_url} name={profile.display_name || profile.username} size={42} ringStyle={profile.avatar_ring_style} ringColor={profile.avatar_ring_color} />
      <span className="ss-mention-profile-id"><strong>{profile.display_name || profile.username}{profile.is_verified ? <i aria-label="Verified">&#10003;</i> : null}</strong><small>@{profile.username}</small></span>
      <UserBadges userId={profile.id} size={18} maxVisible={3} />
    </div>
    {profile.bio ? <p>{profile.bio}</p> : null}
    <div className="ss-mention-profile-stats"><span><strong>{profile.follower_count ?? 0}</strong> followers</span><span><strong>{profile.pick_record?.wins ?? 0}-{profile.pick_record?.losses ?? 0}</strong> record</span></div>
    <Link className="ss-mention-profile-open" href={`/profile/${profile.username}`}>View profile</Link>
  </div>
}

function ProfilePreviewTarget({ profile, children, className }: { profile: MentionProfile; children: ReactNode; className: string }) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [visible, setVisible] = useState(false)
  const clearTimer = useCallback(() => { if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = null }, [])
  const show = useCallback(() => { if (window.matchMedia('(hover: none)').matches) return; clearTimer(); timerRef.current = setTimeout(() => setVisible(true), 110) }, [clearTimer])
  const keepOpen = useCallback(() => { clearTimer(); setVisible(true) }, [clearTimer])
  const hide = useCallback(() => { clearTimer(); timerRef.current = setTimeout(() => setVisible(false), 180) }, [clearTimer])
  const close = useCallback(() => { clearTimer(); setVisible(false) }, [clearTimer])
  useEffect(() => () => clearTimer(), [clearTimer])

  return <span ref={triggerRef} className={className} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
    {children}
    <FloatingSurface open={visible} anchorRef={triggerRef} onClose={close} className="ss-mention-profile-popover" width={320} ariaLabel={`Profile preview for ${profile.display_name || profile.username}`} onPointerEnter={keepOpen} onPointerLeave={hide}>
      <MentionProfileCard profile={profile} />
    </FloatingSurface>
  </span>
}

export function MentionHoverLink({ profile }: { profile: MentionProfile }) {
  return <ProfilePreviewTarget profile={profile} className="ss-mention-tooltip-trigger">
    <Link href={`/profile/${profile.username}`} onClick={event => event.stopPropagation()} className="ss-mention-link">@{profile.username}</Link>
  </ProfilePreviewTarget>
}

export function ProfileHoverTarget({ profile, children, className = '' }: { profile: MentionProfile; children: ReactNode; className?: string }) {
  return <ProfilePreviewTarget profile={profile} className={`ss-profile-hover-target ${className}`}>{children}</ProfilePreviewTarget>
}
