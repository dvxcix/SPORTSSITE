import { createClient } from '@/lib/supabase/server'
import { FeedComposer } from '@/components/social/FeedComposer'
import { PostCardClient } from '@/components/social/PostCardClient'
import { StoriesBar } from '@/components/social/StoriesBar'
import { RightSidebar } from '@/components/layout/RightSidebar'
import { Zap, TrendingUp, Clock, Users } from 'lucide-react'

export const dynamic = 'force-dynamic'

async function getPosts(filter: string) {
  const supabase = await createClient()
  let query = supabase
    .from('posts')
    .select(`
      *,
      author:users(id, username, display_name, avatar_url, is_verified, account_type, pick_record)
    `)
    .eq('visibility', 'public')
    .limit(30)

  if (filter === 'picks') query = query.eq('post_type', 'pick')
  if (filter === 'top') query = query.order('reaction_count', { ascending: false })
  else query = query.order('created_at', { ascending: false })

  const { data } = await query
  return data ?? []
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { filter = 'latest' } = await searchParams
  const posts = await getPosts(filter)

  const filters = [
    { key: 'latest', label: 'Latest', icon: Clock },
    { key: 'top', label: 'Top', icon: TrendingUp },
    { key: 'picks', label: 'Picks', icon: Zap },
    { key: 'following', label: 'Following', icon: Users },
  ]

  return (
    <div className="flex gap-6 px-4 py-6 max-w-5xl mx-auto">
      <div className="flex-1 min-w-0">
        {/* Stories */}
        <StoriesBar />

        {/* Filter tabs */}
        <div className="flex gap-1 mb-4 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          {filters.map(f => {
            const Icon = f.icon
            return (
              <a
                key={f.key}
                href={`/feed?filter=${f.key}`}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                  filter === f.key
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Icon size={12} />
                {f.label}
              </a>
            )
          })}
        </div>

        {/* Post composer */}
        <div className="mb-4">
          <FeedComposer />
        </div>

        {/* Posts */}
        {posts.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🏟️</p>
            <p className="text-zinc-400 font-medium">No posts yet</p>
            <p className="text-zinc-600 text-sm mt-1">Be the first to drop a pick</p>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map(post => (
              <PostCardClient key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>

      <RightSidebar />
    </div>
  )
}
