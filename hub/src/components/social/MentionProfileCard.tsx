'use client'

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { UserBadges } from './UserBadges'
import { MemberAvatar } from './MemberAvatar'
import { FloatingSurface } from '@/components/ui/FloatingSurface'
import { useAuth } from '@/context/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { fetchVisiblePickRecords, type VisiblePickRecord } from '@/lib/visiblePickRecords'

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
    <div className="ss-mention-profile-stats"><span><strong>{profile.follower_count ?? 0}</strong> followers</span>{typeof profile.pick_record?.wins === 'number' && typeof profile.pick_record?.losses === 'number' && <span><strong>{profile.pick_record.wins}-{profile.pick_record.losses}</strong> record</span>}</div>
    <Link className="ss-mention-profile-open" href={`/profile/${profile.username}`}>View profile</Link>
  </div>
}

function ProfilePreviewTarget({ profile, children, className }: { profile: MentionProfile; children: ReactNode; className: string }) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [visible, setVisible] = useState(false)
  const { user, loading, authUnavailable } = useAuth()
  const viewerKey = `${user?.id ?? 'guest'}:${loading}:${authUnavailable}`
  const [recordState, setRecordState] = useState<{ viewerKey: string; targetId: string; record: VisiblePickRecord | null } | null>(null)
  const currentContext = `${viewerKey}:${profile.id}`
  const [observedContext, setObservedContext] = useState(currentContext)
  if (observedContext !== currentContext) {
    setObservedContext(currentContext)
    setRecordState(null)
  }
  const clearTimer = useCallback(() => { if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = null }, [])
  const show = useCallback(() => { if (window.matchMedia('(hover: none)').matches) return; clearTimer(); if (!visible) setRecordState(null); timerRef.current = setTimeout(() => setVisible(true), 110) }, [clearTimer, visible])
  const keepOpen = useCallback(() => { clearTimer(); setVisible(true) }, [clearTimer])
  const hide = useCallback(() => { clearTimer(); timerRef.current = setTimeout(() => setVisible(false), 180) }, [clearTimer])
  const close = useCallback(() => { clearTimer(); setVisible(false) }, [clearTimer])
  useEffect(() => () => clearTimer(), [clearTimer])
  useEffect(() => {
    if (!visible || loading || authUnavailable) return
    let cancelled = false
    const targetId = profile.id.toLowerCase()
    void fetchVisiblePickRecords(createClient(), [targetId]).then(result => {
      if (!cancelled) setRecordState({ viewerKey, targetId, record: result.records.get(targetId) ?? null })
    })
    return () => { cancelled = true }
  }, [visible, loading, authUnavailable, viewerKey, profile.id])
  const record = visible && recordState?.viewerKey === viewerKey && recordState.targetId === profile.id.toLowerCase() ? recordState.record : null

  return <span ref={triggerRef} className={className} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
    {children}
    <FloatingSurface open={visible} anchorRef={triggerRef} onClose={close} className="ss-mention-profile-popover" width={320} align="start" ariaLabel={`Profile preview for ${profile.display_name || profile.username}`} onPointerEnter={keepOpen} onPointerLeave={hide}>
      <MentionProfileCard profile={{ ...profile, pick_record: record }} />
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
