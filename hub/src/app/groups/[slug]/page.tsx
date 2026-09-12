import { createClient } from '@/lib/supabase/server'
import { attachUserReactions, getChannelMessages } from '@/lib/queries'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { PostCardClient } from '@/components/social/PostCardClient'
import { FeedComposer } from '@/components/social/FeedComposer'
import { GroupJoinButton } from '@/components/groups/GroupJoinButton'
import { GroupInviteModal } from '@/components/groups/GroupInviteModal'
import { GroupInviteResponse } from '@/components/groups/GroupInviteResponse'
import { ChatRoom } from '@/components/chat/ChatRoom'
import { Users, Lock, Globe, Settings } from 'lucide-react'
import { sportLogoUrl } from '@/lib/sportLogos'
import type { Metadata } from 'next'
import { CommunityNav } from '@/components/community/CommunityNav'
import { GroupWorkspaceTabs } from '@/components/groups/GroupWorkspaceTabs'
import { GroupMemberOnboarding } from '@/components/groups/GroupMemberOnboarding'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { SafeImage } from '@/components/ui/SafeImage'
import styles from './GroupPage.module.css'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data: group } = await supabase.from('groups').select('name, description, banner_url').eq('slug', slug).single()
  if (!group) return {}
  const description = group.description || `${group.name} on SlipSurge`
  return {
    title: `${group.name} · SlipSurge`,
    description,
    openGraph: { title: group.name, description, images: group.banner_url ? [group.banner_url] : undefined },
  }
}

export default async function GroupPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ setup?: string }> }) {
  const { slug } = await params
  const { setup } = await searchParams
  const supabase = await createClient()
  const [{ data: { user } }, { data: group }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('groups').select('*').eq('slug', slug).single(),
  ])
  if (!group) notFound()

  let isMember = false
  let isOwner = false
  let memberRole: 'owner' | 'admin' | 'moderator' | 'analyst' | 'member' | 'subscriber' | null = null
  if (user) {
    const { data: member } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', group.id)
      .eq('user_id', user.id)
      .maybeSingle()
    isMember = !!member
    isOwner = member?.role === 'owner'
    memberRole = member?.role as typeof memberRole
  }

  // A private group has no self-serve join — check for a pending invite
  // instead, so a non-member sees an Accept/Decline prompt if they were
  // actually invited, or nothing at all if they weren't.
  let pendingInvite: { id: string; invited_by_username?: string } | null = null
  if (user && !isMember && !group.is_public) {
    const { data: invite } = await supabase
      .from('group_invites')
      .select('id, status, inviter:users!group_invites_invited_by_fkey(username)')
      .eq('group_id', group.id)
      .eq('invited_user_id', user.id)
      .eq('status', 'pending')
      .maybeSingle()
    if (invite) pendingInvite = { id: invite.id, invited_by_username: (invite as any).inviter?.username }
  }

  // Private-group content (feed + chat) is only visible to members — a
  // non-member of a private group gets the header/join-or-invite state and
  // nothing else. Public groups stay open to everyone, matching how they
  // already worked.
  const canViewContent = group.is_public || isMember

  const postsPromise = async () => {
    if (!canViewContent) return []
    const { data: rawPosts } = await supabase
      .from('posts')
      .select('*, author:users!posts_author_id_fkey(id, username, display_name, avatar_url, avatar_ring_style, avatar_ring_color, bio, follower_count, is_verified, account_type, pick_record, tier, beta_access_active)')
      .eq('group_id', group.id)
      .order('created_at', { ascending: false })
      .limit(20)
    return attachUserReactions(rawPosts ?? [], user?.id)
  }
  const [
    { data: members },
    posts,
    chatMessages,
    { data: groupChannel },
    { data: groupChannels },
    { data: memberPreferences },
    { data: channelPreferences },
  ] = await Promise.all([
    supabase.from('group_members').select('role,user:users(id, username, display_name, avatar_url, is_verified)').eq('group_id', group.id).order('role').limit(8),
    postsPromise(),
    canViewContent && group.channel_id ? getChannelMessages(group.channel_id, 50) : Promise.resolve([]),
    group.channel_id
      ? supabase.from('channels').select('slug').eq('id', group.channel_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    isMember
      ? supabase.from('channels').select('id,name,description,icon').eq('group_id', group.id).order('created_at')
      : Promise.resolve({ data: [], error: null }),
    isMember && user
      ? supabase.from('group_member_preferences').select('notification_level,flair,onboarding_completed_at,rules_accepted_at').eq('group_id', group.id).eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    isMember && user
      ? supabase.from('group_channel_preferences').select('channel_id').eq('group_id', group.id).eq('user_id', user.id)
      : Promise.resolve({ data: [], error: null }),
  ])

  const canPost = isMember
  const memberPreviews = (members ?? []).flatMap(member => {
    const profile = Array.isArray(member.user) ? member.user[0] : member.user
    return profile ? [{ role: member.role, user: profile }] : []
  })

  return (
    <div className={styles.page}>
      <CommunityNav />
      <div className={styles.community}>
      <div className={styles.banner}>
        <SafeImage src={group.banner_url} alt="" className={styles.bannerImage} />
        {group.sport && (
          <div className={styles.sportBadge}>
            {sportLogoUrl(group.sport) ? (
              <span>
                <Image src={sportLogoUrl(group.sport)!} alt={group.sport} width={20} height={20} />
              </span>
            ) : (
              <span>{group.sport}</span>
            )}
          </div>
        )}
      </div>

      <div className={styles.identity}>
        <div className={styles.identityRow}>
          <div className={styles.avatar}>
            <SafeImage src={group.avatar_url} alt="" className={styles.avatarImage} fallback={group.emoji || '👥'} />
          </div>
          <div className={styles.actions}>
            {isOwner && (
              <Link href={`/groups/${slug}/settings`}
                className={styles.secondaryAction}>
                <Settings size={13} /> Manage
              </Link>
            )}
            {user && isMember && !isOwner && (
              <GroupJoinButton groupId={group.id} initialMember={true} />
            )}
            {user && !isMember && group.is_public && (
              <GroupJoinButton groupId={group.id} initialMember={false} />
            )}
            {user && isMember && (
              <GroupInviteModal groupId={group.id} groupSlug={slug} groupName={group.name} currentUserId={user.id} />
            )}
            {user && isMember && (
              <GroupMemberOnboarding
                groupId={group.id}
                groupName={group.name}
                rules={group.rules}
                channels={groupChannels ?? []}
                initialPreferences={{
                  notificationLevel: memberPreferences?.notification_level ?? 'highlights',
                  flair: memberPreferences?.flair ?? '',
                  channelIds: (channelPreferences ?? []).map(preference => preference.channel_id),
                  completed: Boolean(memberPreferences?.onboarding_completed_at),
                  rulesAccepted: Boolean(memberPreferences?.rules_accepted_at),
                }}
                autoOpen={setup === 'community' && !memberPreferences?.onboarding_completed_at}
              />
            )}
            {!user && <Link href="/auth/login" className={styles.primaryAction}>Sign in</Link>}
          </div>
        </div>

        <h1 className={styles.title}>
          {group.name}
          {!group.is_public ? <Lock size={14} /> : <Globe size={14} />}
        </h1>
        {group.description && <p className={styles.description}>{group.description}</p>}
        <p className={styles.memberMeta}>
          <Users size={11} /> {group.member_count ?? 0} members
        </p>

        {/* Member previews */}
        {memberPreviews.length > 0 && (
          <div className={styles.memberStack}>
            {memberPreviews.slice(0, 6).map(m => (
              <Link key={m.user.id} href={`/profile/${m.user.username}`} aria-label={`${m.user.display_name || m.user.username}, ${m.role}`} data-role={m.role}>
                <MemberAvatar src={m.user.avatar_url} name={m.user.display_name || m.user.username} size={28} />
                {['owner', 'admin', 'moderator'].includes(m.role) && <span className={styles.roleMark}>{m.role === 'owner' ? 'O' : m.role === 'admin' ? 'A' : 'M'}</span>}
              </Link>
            ))}
            {(group.member_count ?? 0) > 6 && <span>+{(group.member_count ?? 0) - 6} more</span>}
          </div>
        )}

        {pendingInvite && user && (
          <div className={styles.inviteResponse}>
            <GroupInviteResponse
              inviteId={pendingInvite.id}
              invitedByUsername={pendingInvite.invited_by_username}
            />
          </div>
        )}
      </div>

      <div className={styles.divider} />

      {!canViewContent ? (
        <div className={styles.locked}>
          <Lock size={28} />
          <p>This is a private group</p>
          <span>Only members can see posts and chat here. Ask a member to invite you.</span>
        </div>
      ) : (
        <GroupWorkspaceTabs
          postCount={posts.length}
          posts={<div className={styles.posts}>
            {canPost && user && <FeedComposer groupId={group.id} />}
            {(posts?.length ?? 0) === 0 ? (
              <div className={styles.emptyPosts}>
                <p>💬</p>
                <strong>No posts yet in this group</strong>
                {!isMember && group.is_public && (
                  <span>Join to post</span>
                )}
              </div>
            ) : (
              posts.map((p: any, i: number) => <PostCardClient key={p.id} post={p} index={i} />)
            )}
          </div>}
          chat={group.channel_id && isMember ? (
            <div className="ss-group-chat-shell">
              <div className={styles.chatViewport}>
                <ChatRoom
                  channelId={group.channel_id}
                  channelSlug={groupChannel?.slug || `group-${slug}`}
                  channelName={group.name}
                  initialMessages={chatMessages}
                  currentUserId={user?.id}
                  canModerate={memberRole === 'owner' || memberRole === 'admin' || memberRole === 'moderator'}
                />
              </div>
            </div>
          ) : undefined}
        />
      )}
      </div>
    </div>
  )
}
