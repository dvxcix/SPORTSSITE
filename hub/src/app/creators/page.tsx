import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Star, TrendingUp, Lock } from 'lucide-react'
import { FollowButton } from '@/components/social/FollowButton'

export const revalidate = 120

export default async function CreatorsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: creators } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, bio, is_verified, follower_count, pick_record, subscription_price')
    .eq('account_type', 'creator')
    .order('follower_count', { ascending: false })
    .limit(30)

  let followingIds = new Set<string>()
  if (user) {
    const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', user.id)
    followingIds = new Set((follows ?? []).map((f: any) => f.following_id))
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-zinc-800 rounded-lg"><Star size={20} className="text-yellow-400" /></div>
        <div>
          <h1 className="text-xl font-black text-white">Creators</h1>
          <p className="text-xs text-zinc-500">Pro cappers & sports analysts</p>
        </div>
      </div>

      {/* Apply CTA */}
      {user && (
        <div className="mb-6 p-4 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-between gap-4">
          <div>
            <p className="font-bold text-white text-sm">Want to be a Creator?</p>
            <p className="text-xs text-zinc-500 mt-0.5">Share picks, build a following, earn money</p>
          </div>
          <Link href="/creators/apply"
            className="shrink-0 flex items-center gap-1.5 bg-green-500 hover:bg-green-400 text-black text-xs font-black px-4 py-2 rounded-lg transition-colors">
            Apply Now →
          </Link>
        </div>
      )}

      {(creators?.length ?? 0) === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">⭐</p>
          <p className="text-zinc-400 font-medium">No creators yet</p>
          <p className="text-xs text-zinc-600 mt-1">Be the first — <Link href="/creators/apply" className="text-green-400 hover:underline">apply now</Link></p>
        </div>
      ) : (
        <div className="space-y-3">
          {(creators ?? []).map((c: any) => (
            <div key={c.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-all">
              <div className="flex items-start gap-4">
                <Link href={`/profile/${c.username}`}>
                  <div className="w-14 h-14 rounded-2xl bg-zinc-700 overflow-hidden shrink-0 ring-2 ring-purple-500/30">
                    {c.avatar_url && <img src={c.avatar_url} alt="" className="w-full h-full object-cover" />}
                  </div>
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link href={`/profile/${c.username}`} className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
                        <p className="font-black text-white">{c.display_name || c.username}</p>
                        {c.is_verified && <span className="text-green-400 text-sm">✓</span>}
                        <span className="text-[10px] font-bold text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded-full">PRO</span>
                      </Link>
                      <p className="text-xs text-zinc-500">@{c.username}</p>
                    </div>
                    {user && user.id !== c.id && (
                      <FollowButton currentUserId={user.id} targetUserId={c.id} initialFollowing={followingIds.has(c.id)} />
                    )}
                  </div>
                  {c.bio && <p className="text-xs text-zinc-400 mt-2 line-clamp-2">{c.bio}</p>}
                  <div className="flex items-center gap-4 mt-2 flex-wrap">
                    {c.pick_record && (
                      <span className="flex items-center gap-1 text-xs font-bold text-green-400">
                        <TrendingUp size={10} /> {c.pick_record}
                      </span>
                    )}
                    <span className="text-xs text-zinc-600">{c.follower_count ?? 0} followers</span>
                    {c.subscription_price && (
                      <span className="flex items-center gap-1 text-xs font-bold text-yellow-400">
                        <Lock size={10} /> ${c.subscription_price}/mo
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
