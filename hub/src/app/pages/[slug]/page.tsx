import { createClient } from '@/lib/supabase/server'
import { attachUserReactions } from '@/lib/queries'
import { notFound } from 'next/navigation'
import { PostCardClient } from '@/components/social/PostCardClient'
import { PageFollowButton } from '@/components/pages/PageFollowButton'
import { FeedComposer } from '@/components/social/FeedComposer'
import { Users, Calendar } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function PageDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: page } = await supabase.from('pages').select('*').eq('slug', slug).single()
  if (!page) notFound()

  const isOwner = user?.id === page.owner_id

  let isFollowing = false
  if (user) {
    const { data } = await supabase.from('page_follows').select('id').eq('user_id', user.id).eq('page_id', page.id).maybeSingle()
    isFollowing = !!data
  }

  const { data: rawPosts } = await supabase
    .from('posts')
    .select('*, author:users(id, username, display_name, avatar_url, is_verified, account_type, pick_record)')
    .eq('page_id', page.id)
    .order('created_at', { ascending: false })
    .limit(20)
  const posts = await attachUserReactions(rawPosts ?? [], user?.id)

  return (
    <div className="max-w-2xl mx-auto">
      {/* Banner */}
      <div className="h-40 bg-gradient-to-r from-zinc-800 to-zinc-700 relative overflow-hidden">
        {page.banner_url && <img src={page.banner_url} alt="" className="w-full h-full object-cover" />}
      </div>

      <div className="px-4 pb-4">
        <div className="relative z-10 flex items-end justify-between -mt-10 mb-4">
          <div className="w-20 h-20 rounded-2xl bg-zinc-800 border-4 border-zinc-950 flex items-center justify-center text-3xl overflow-hidden shadow-xl">
            {page.avatar_url ? <img src={page.avatar_url} alt="" className="w-full h-full object-cover" /> : page.emoji ?? '⭐'}
          </div>
          <div className="flex gap-2">
            {isOwner && (
              <a href={`/pages/${slug}/settings`} className="inline-flex items-center h-9 px-4 text-sm rounded-xl border border-zinc-700 text-white hover:bg-zinc-800 font-bold transition-colors">
                Manage
              </a>
            )}
            {user && !isOwner && <PageFollowButton userId={user.id} pageId={page.id} initialFollowing={isFollowing} />}
            {!user && <a href="/auth/login" className="inline-flex items-center h-9 px-4 text-sm rounded-xl bg-green-500 hover:bg-green-400 text-black font-black transition-colors">Follow</a>}
          </div>
        </div>

        <h1 className="text-xl font-black text-white flex items-center gap-2">
          {page.name}
          {page.is_verified && <span className="text-green-400 text-sm">✓</span>}
        </h1>
        {page.category && <span className="text-xs font-bold text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-full">{page.category}</span>}
        {page.description && <p className="text-sm text-zinc-400 mt-2 leading-relaxed">{page.description}</p>}

        <div className="flex gap-6 mt-3">
          <div>
            <p className="font-black text-white text-lg leading-none">{page.follower_count ?? 0}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Followers</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1">
              <Calendar size={11} /> Created {new Date(page.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-800" />

      <div className="px-4 py-4 space-y-3">
        {isOwner && <FeedComposer />}
        {(posts?.length ?? 0) === 0 ? (
          <div className="text-center py-16">
            <p className="text-3xl mb-3">📄</p>
            <p className="text-zinc-400">No posts yet</p>
          </div>
        ) : (
          (posts ?? []).map((p: any) => <PostCardClient key={p.id} post={p} />)
        )}
      </div>
    </div>
  )
}
