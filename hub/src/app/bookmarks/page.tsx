import { createClient } from '@/lib/supabase/server'
import { attachUserReactions } from '@/lib/queries'
import { redirect } from 'next/navigation'
import { PostCardClient } from '@/components/social/PostCardClient'
import { Bookmark } from 'lucide-react'
import { TierGate } from '@/components/layout/TierGate'

export const dynamic = 'force-dynamic'

export default async function BookmarksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/bookmarks')

  const { data: bookmarks } = await supabase
    .from('bookmarks')
    .select(`
      post:posts(
        *,
        author:users!posts_author_id_fkey(id, username, display_name, avatar_url, is_verified, account_type, pick_record)
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(30)

  const bookmarkedPosts = (bookmarks ?? []).map((b: any) => b.post).filter(Boolean)
  const posts = (await attachUserReactions(bookmarkedPosts, user.id)).map(p => ({ ...p, user_bookmarked: true }))

  return (
    <TierGate requiredTier="basic" label="Bookmarks">
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-zinc-800 rounded-lg">
          <Bookmark size={20} className="text-yellow-400" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">Bookmarks</h1>
          <p className="text-xs text-zinc-500">{posts.length} saved post{posts.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">🔖</p>
          <p className="text-zinc-400 font-medium">No bookmarks yet</p>
          <p className="text-zinc-600 text-sm mt-1">Tap the bookmark icon on any post to save it</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((p: any) => <PostCardClient key={p.id} post={p} />)}
        </div>
      )}
    </div>
    </TierGate>
  )
}
