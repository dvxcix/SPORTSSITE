import { CreatorDiscordClaim } from '@/components/creator/CreatorDiscordClaim'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getChannelMessages } from '@/lib/queries'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
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
import { GroupChannelWorkspace, type GroupWorkspaceChannel } from '@/components/groups/GroupChannelWorkspace'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { SafeImage } from '@/components/ui/SafeImage'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import styles from './GroupPage.module.css'
import { hasCurrentCreatorAccess } from '@/lib/creatorCommerce'
import { publishedPaidCommunities, invitedCommunityEntry } from '@/lib/creatorCommunityDirectory'
import { CommunityEntry } from '@/components/groups/CommunityEntry'
import { groupFeedPage } from '@/lib/groupFeed'
import { GroupPostFeed } from '@/components/groups/GroupPostFeed'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data: group } = await supabase.from('groups').select('name, description, banner_url, sport').eq('slug', slug).single()
  if (!group) return {}
  if (group.sport?.toUpperCase() === 'MLB') {
    const { data: { user } } = await supabase.auth.getUser()
    if (!(await canViewMlb(supabase, user?.id))) return { robots: { index: false, follow: false, nocache: true } }
  }
  const description = group.description || `${group.name} on SlipSurge`
  return {
    title: `${group.name} · SlipSurge`,
    description,
    openGraph: { title: group.name, description, images: group.banner_url ? [group.banner_url] : undefined },
  }
}

export default async function GroupPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ setup?: string; channel?: string; view?: string }> }) {
  const { slug } = await params
  const { setup, channel: requestedChannel, view } = await searchParams
  const supabase = await createClient()
  const [{ data: { user } }, { data: group }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('groups').select('*').eq('slug', slug).single(),
  ])
  const showMlb = await canViewMlb(supabase, user?.id)
  if (!group) {
    const [published,invitation]=await Promise.all([publishedPaidCommunities({slug}),user?invitedCommunityEntry(supabase,slug,user.id):Promise.resolve(null)])
    const entry=invitation??published[0]
    if(!entry||!showMlb&&entry.sport?.toUpperCase()==='MLB')notFound()
    return <CommunityEntry entry={entry} signedIn={Boolean(user)}/>
  }
  if (!showMlb && group.sport?.toUpperCase() === 'MLB') notFound()

  let isMember = false
  let isOwner = false
  let hasPaidAccess = false
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
  if (user && !isMember && group.creator_product_id) {
    const { data: entitlement, error } = await supabase.from('creator_entitlements').select('status,current_period_end').eq('user_id', user.id).eq('product_id', group.creator_product_id).maybeSingle()
    if (error) throw new Error('Community access could not be verified.')
    hasPaidAccess = Boolean(entitlement && hasCurrentCreatorAccess(entitlement))
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

  const [
    { data: members },
    postPage,
    { data: groupChannels },
    { data: memberPreferences },
    { data: channelPreferences },
  ] = await Promise.all([
    supabase.from('group_members').select('role,user:users(id, username, display_name, avatar_url, avatar_ring_style, avatar_ring_color, is_verified)').eq('group_id', group.id).order('role').limit(8),
    canViewContent?groupFeedPage(supabase,group.id,{picks:view==='picks',userId:user?.id,hideMlb:!showMlb}):Promise.resolve({posts:[],nextCursor:null,hasMore:false}),
    isMember
      ? supabase.from('channels').select('id,slug,name,description,icon,channel_kind,sort_order').eq('group_id', group.id).order('sort_order').order('created_at')
      : Promise.resolve({ data: [], error: null }),
    isMember && user
      ? supabase.from('group_member_preferences').select('notification_level,flair,onboarding_completed_at,rules_accepted_at').eq('group_id', group.id).eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    isMember && user
      ? supabase.from('group_channel_preferences').select('channel_id').eq('group_id', group.id).eq('user_id', user.id)
      : Promise.resolve({ data: [], error: null }),
  ])

  const {data:discordAccess}=isMember?await createAdminClient().from('creator_discord_integrations').select('guild_name,role_name,invite_url').eq('group_id',group.id).eq('enabled',true).maybeSingle():{data:null}
  const workspaceChannels = (groupChannels ?? []) as GroupWorkspaceChannel[]
  const activeChannel = workspaceChannels.find(item => item.slug === requestedChannel)
    ?? workspaceChannels.find(item => item.id === group.channel_id)
    ?? workspaceChannels[0]
  const [{ data: groupCapabilities }, { data: channelCapabilities }] = user && isMember
    ? await Promise.all([
      supabase.rpc('get_my_community_permissions', { p_group_id: group.id }),
      activeChannel ? supabase.rpc('get_my_channel_permissions', { p_channel_id: activeChannel.id }) : Promise.resolve({ data: null, error: null }),
    ])
    : [{ data: null }, { data: null }]
  const chatMessages = activeChannel && canViewContent && isMember && (view==='chat'||Boolean(requestedChannel)) ? await getChannelMessages(activeChannel.id, 80) : []
  const canModerate = Boolean((channelCapabilities as { moderate?: boolean } | null)?.moderate)
    || memberRole === 'owner' || memberRole === 'admin' || memberRole === 'moderator'
  const canSendChannel = Boolean((channelCapabilities as { send?: boolean } | null)?.send)
    || memberRole === 'owner' || memberRole === 'admin'
  const canInvite = Boolean((groupCapabilities as { create_invites?: boolean } | null)?.create_invites)
    || memberRole === 'owner' || memberRole === 'admin' || memberRole === 'moderator'

  const canPost = isMember
  const memberPreviews = (members ?? []).flatMap(member => {
    const profile = Array.isArray(member.user) ? member.user[0] : member.user
    return profile ? [{ role: member.role, user: profile }] : []
  })

  return (
    <div className={styles.page}>
      <CommunityNav />
      <div className={styles.community}>
      <div className={styles.banner} data-has-banner={Boolean(group.banner_url)}>
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
              <>
              <Link href={`/groups/${slug}/settings`}
                className={styles.secondaryAction}>
                <Settings size={13} /> Manage
              </Link>
              <Link href="/creators/studio" className={styles.secondaryAction}>Creator Studio</Link>
              </>
            )}
            {user && isMember && !isOwner && (
              <GroupJoinButton paidProductId={group.access_type === 'paid' ? group.creator_product_id : null} groupId={group.id} initialMember={true} />
            )}
            {user && !isMember && (group.is_public || hasPaidAccess) && (
              <GroupJoinButton paidProductId={group.access_type === 'paid' ? group.creator_product_id : null} groupId={group.id} initialMember={false} />
            )}
            {user && isMember && canInvite && (
              <GroupInviteModal groupId={group.id} groupSlug={slug} groupName={group.name} currentUserId={user.id} />
            )}
            {user && isMember && (

        <GroupMemberOnboarding
                triggerLabel={isOwner ? 'Preferences' : undefined}
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
                autoOpen={!isOwner && setup === 'community' && !memberPreferences?.onboarding_completed_at}
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
                <MemberAvatar src={m.user.avatar_url} ringStyle={m.user.avatar_ring_style} ringColor={m.user.avatar_ring_color} name={m.user.display_name || m.user.username} size={28} />
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
      {isMember&&discordAccess&&<CreatorDiscordClaim groupId={group.id} slug={group.slug} guildName={discordAccess.guild_name} roleName={discordAccess.role_name} inviteUrl={discordAccess.invite_url}/>}

      {!canViewContent ? (
        <div className={styles.locked}>
          <Lock size={28} />
          <p>This is a private group</p>
          <span>Only members can see posts and chat here. Ask a member to invite you.</span>
        </div>
      ) : (

      <GroupWorkspaceTabs
          postCount={postPage.posts.length}
          initialTab={view === 'chat' || Boolean(requestedChannel) ? 'chat' : view==='picks'?'picks':'posts'}
          posts={<div className={styles.posts}>
            {canPost && user && <FeedComposer groupId={group.id} groupAudience={group.access_type === 'paid' || !group.is_public ? 'members' : 'public'} />}
            {!isMember&&group.is_public&&<p className="px-5 py-3 text-sm text-[var(--text-2)]">Join this community to post and chat.</p>}
            <GroupPostFeed key={`${group.id}:${view==='picks'?'picks':'posts'}:${postPage.posts[0]?.id||'empty'}`} groupId={group.id} picks={view==='picks'} initialPosts={postPage.posts} initialCursor={postPage.nextCursor} initialHasMore={postPage.hasMore}/>
          </div>}
          chat={activeChannel && isMember ? (
            <GroupChannelWorkspace groupSlug={slug} channels={workspaceChannels} activeChannel={activeChannel}>
              <div className={styles.chatViewport}>
                <ChatRoom
                  key={activeChannel.id}
                  channelId={activeChannel.id}
                  channelSlug={activeChannel.slug}
                  channelName={activeChannel.name}
                  contextHref={`/groups/${slug}?view=chat&channel=${encodeURIComponent(activeChannel.slug)}`}
                  initialMessages={chatMessages}
                  currentUserId={user?.id}
                  canModerate={canModerate}
                  readOnly={!canSendChannel}
                />
              </div>
            </GroupChannelWorkspace>
          ) : undefined}
        />
      )}
      </div>
    </div>
  )
}
