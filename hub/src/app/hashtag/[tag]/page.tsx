import { createClient } from '@/lib/supabase/server'
import { PostCardClient } from '@/components/social/PostCardClient'
import { Hash } from 'lucide-react'

export const revalidate = 60

export default async function HashtagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params
  const supabase = await createClient()

  const { data: posts } = await supabase
    .from('posts')
    .select('*, author:users(id, username, display_name, avatar_url, is_verified, account_type, pick_record)')
    .eq('visibility', 'public')
    .or(`sport.ilike.${tag},content.ilike.%${tag}%,content.ilike.%#${tag}%`)
    .order('created_at', { ascending: false })
    .limit(30)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
          <Hash size={20} className="text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">#{tag}</h1>
          <p className="text-xs text-zinc-500">{posts?.length ?? 0} posts</p>
        </div>
      </div>

      {(posts?.length ?? 0) === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-zinc-400 font-medium">No posts for #{tag}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(posts ?? []).map((p: any) => <PostCardClient key={p.id} post={p} />)}
        </div>
      )}
    </div>
  )
}
