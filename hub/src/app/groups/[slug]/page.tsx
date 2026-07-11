import { createClient } from '@/lib/supabase/server'
import { attachUserReactions } from '@/lib/queries'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PostCardClient } from '@/components/social/PostCardClient'
import { FeedComposer } from '@/components/social/FeedComposer'
import { GroupJoinButton } from '@/components/groups/GroupJoinButton'
import { Users, Lock, Globe, Settings } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function GroupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: group } = await supabase.from('groups').select('*').eq('slug', slug).single()
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

  const { data: members } = await supabase
    .from('group_members')
    .select('user:users(id, username, display_name, avatar_url, is_verified)')
    .eq('group_id', group.id)
    .limit(8)

  const { data: rawPosts } = await supabase
    .from('posts')
    .select('*, author:users(id, username, display_name, avatar_url, is_verified, account_type, pick_record)')
    .eq('group_id', group.id)
    .order('created_at', { ascending: false })
    .limit(20)
  const posts = await attachUserReactions(rawPosts ?? [], user?.id)

  const canPost = isMember || group.is_public

  return (
    <div className="max-w-2xl mx-auto">
      {/* Banner */}
      <div className="h-36 bg-gradient-to-r from-zinc-800 to-zinc-700 relative overflow-hidden">
        {group.banner_url && <img src={group.banner_url} alt="" className="w-full h-full object-cover" />}
        {group.sport && (
          <div className="absolute top-3 right-3">
            <span className="text-xs font-bold text-blue-400 bg-blue-400/20 backdrop-blur px-2 py-1 rounded-full border border-blue-400/30">{group.sport}</span>
          </div>
        )}
      </div>

      <div className="px-4 pb-4">
        <div className="relative z-10 flex items-end justify-between -mt-8 mb-4">
          <div className="w-16 h-16 rounded-xl bg-zinc-800 border-4 border-zinc-950 flex items-center justify-center text-2xl shadow-lg">
            {group.avatar_url ? <img src={group.avatar_url} alt="" className="w-full h-full object-cover rounded-lg" /> : (group.sport === 'MLB' ? '⚾' : group.sport === 'NFL' ? '🏈' : group.sport === 'NBA' ? '🏀' : group.sport === 'NHL' ? '🏒' : '👥')}
          </div>
          <div className="flex gap-2">
            {isOwner && (
              <Link href={`/groups/${slug}/settings`}
                className="flex items-center gap-1.5 border border-zinc-700 text-zinc-300 text-xs font-bold px-3 py-2 rounded-lg hover:bg-zinc-800 transition-colors">
                <Settings size={13} /> Manage
              </Link>
            )}
            {user && !isOwner && <GroupJoinButton userId={user.id} groupId={group.id} initialMember={isMember} />}
            {!user && <Link href="/auth/login" className="bg-green-500 hover:bg-green-400 text-black text-xs font-black px-4 py-2 rounded-lg transition-colors">Join</Link>}
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
            {(members ?? []).slice(0, 6).map((m: any) => (
              <div key={m.user?.id} className="w-7 h-7 rounded-full bg-zinc-700 border-2 border-zinc-950 overflow-hidden -ml-1 first:ml-0">
                {m.user?.avatar_url && <img src={m.user.avatar_url} alt="" className="w-full h-full object-cover" />}
              </div>
            ))}
            {(group.member_count ?? 0) > 6 && <span className="text-xs text-zinc-500 ml-2">+{(group.member_count ?? 0) - 6} more</span>}
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800" />

      <div className="px-4 py-4 space-y-3">
        {canPost && user && <FeedComposer />}
        {(posts?.length ?? 0) === 0 ? (
          <div className="text-center py-16">
            <p className="text-3xl mb-3">💬</p>
            <p className="text-zinc-400">No posts yet in this group</p>
            {!isMember && group.is_public && (
              <p className="text-xs text-zinc-600 mt-1">Join to post</p>
            )}
          </div>
        ) : (
          (posts ?? []).map((p: any) => <PostCardClient key={p.id} post={p} />)
        )}
      </div>
    </div>
  )
}
