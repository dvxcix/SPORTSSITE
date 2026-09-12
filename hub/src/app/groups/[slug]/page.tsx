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
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { SafeImage } from '@/components/ui/SafeImage'

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

export default async function GroupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const [{ data: { user } }, { data: group }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('groups').select('*').eq('slug', slug).single(),
  ])
  if (!group) notFound()

  let isMember = false
  let isOwner = false
  if (user) {
    const { data: member } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', group.id)
      .eq('user_id', user.id)
      .maybeSingle()
    isMember = !!member
    isOwner = member?.role === 'owner'
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
  const [{ data: members }, posts, chatMessages, { data: groupChannel }] = await Promise.all([
    supabase.from('group_members').select('user:users(id, username, display_name, avatar_url, is_verified)').eq('group_id', group.id).limit(8),
    postsPromise(),
    canViewContent && group.channel_id ? getChannelMessages(group.channel_id, 50) : Promise.resolve([]),
    group.channel_id
      ? supabase.from('channels').select('slug').eq('id', group.channel_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  const canPost = isMember

  return (
    <div className="ss-group-page max-w-4xl mx-auto px-3 py-4 sm:px-6 sm:py-8">
      <CommunityNav />
      <div className="mt-4 overflow-hidden rounded-3xl border border-white/8 bg-[#0d100f]">
      <div className="h-36 bg-gradient-to-r from-zinc-800 to-zinc-700 relative overflow-hidden">
        <SafeImage src={group.banner_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        {group.sport && (
          <div className="absolute top-3 right-3">
            {sportLogoUrl(group.sport) ? (
              <span className="bg-blue-400/20 backdrop-blur p-1.5 rounded-full border border-blue-400/30 flex items-center">
                <Image src={sportLogoUrl(group.sport)!} alt={group.sport} width={20} height={20} className="object-contain" />
              </span>
            ) : (
              <span className="text-xs font-bold text-blue-400 bg-blue-400/20 backdrop-blur px-2 py-1 rounded-full border border-blue-400/30">{group.sport}</span>
            )}
          </div>
        )}
      </div>

      <div className="px-4 pb-4">
        <div className="relative z-10 flex items-end justify-between -mt-8 mb-4">
          <div className="relative w-16 h-16 overflow-hidden rounded-xl bg-zinc-800 border-4 border-zinc-950 flex items-center justify-center text-2xl shadow-lg">
            <SafeImage src={group.avatar_url} alt="" className="h-full w-full rounded-lg object-cover" fallback={group.emoji || '👥'} />
          </div>
          <div className="flex gap-2">
            {isOwner && (
              <Link href={`/groups/${slug}/settings`}
                className="flex items-center gap-1.5 border border-zinc-700 text-zinc-300 text-xs font-bold px-3 py-2 rounded-lg hover:bg-zinc-800 transition-colors">
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
            {!user && <Link href="/auth/login" className="bg-green-500 hover:bg-green-400 text-black text-xs font-black px-4 py-2 rounded-lg transition-colors">Sign in</Link>}
          </div>
        </div>

        <h1 className="text-xl font-black text-white flex items-center gap-2">
          {group.name}
          {!group.is_public ? <Lock size={14} className="text-zinc-500" /> : <Globe size={14} className="text-zinc-600" />}
        </h1>
        {group.description && <p className="text-sm text-zinc-400 mt-1">{group.description}</p>}
        <p className="text-xs text-zinc-600 mt-2 flex items-center gap-1">
          <Users size={11} /> {group.member_count ?? 0} members
        </p>

        {/* Member previews */}
        {(members?.length ?? 0) > 0 && (
          <div className="flex items-center gap-1 mt-3">
            {(members ?? []).slice(0, 6).map((m: any) => m.user && (
              <Link key={m.user.id} href={`/profile/${m.user.username}`} className="-ml-1 first:ml-0" aria-label={m.user.display_name || m.user.username}>
                <MemberAvatar src={m.user.avatar_url} name={m.user.display_name || m.user.username} size={28} />
              </Link>
            ))}
            {(group.member_count ?? 0) > 6 && <span className="text-xs text-zinc-500 ml-2">+{(group.member_count ?? 0) - 6} more</span>}
          </div>
        )}

        {pendingInvite && user && (
          <div className="mt-4">
            <GroupInviteResponse
              inviteId={pendingInvite.id}
              invitedByUsername={pendingInvite.invited_by_username}
            />
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800" />

      {!canViewContent ? (
        <div className="text-center py-20 px-4">
          <Lock size={28} className="mx-auto text-zinc-600 mb-3" />
          <p className="text-zinc-400 font-medium">This is a private group</p>
          <p className="text-xs text-zinc-600 mt-1">Only members can see posts and chat here. Ask a member to invite you.</p>
        </div>
      ) : (
        <GroupWorkspaceTabs
          postCount={posts.length}
          posts={<div className="px-4 py-4 space-y-3">
            {canPost && user && <FeedComposer groupId={group.id} />}
            {(posts?.length ?? 0) === 0 ? (
              <div className="text-center py-16">
                <p className="text-3xl mb-3">💬</p>
                <p className="text-zinc-400">No posts yet in this group</p>
                {!isMember && group.is_public && (
                  <p className="text-xs text-zinc-600 mt-1">Join to post</p>
                )}
              </div>
            ) : (
              posts.map((p: any, i: number) => <PostCardClient key={p.id} post={p} index={i} />)
            )}
          </div>}
          chat={group.channel_id && isMember ? (
            <div className="ss-group-chat-shell">
              <div className="h-[min(620px,70dvh)] min-h-[440px] flex flex-col overflow-hidden">
                <ChatRoom
                  channelId={group.channel_id}
                  channelSlug={groupChannel?.slug || `group-${slug}`}
                  channelName={group.name}
                  initialMessages={chatMessages}
                  currentUserId={user?.id}
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
