import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { TrendingUp, Users } from 'lucide-react'
import { SuggestedUsers } from '@/components/social/SuggestedUsers'

const TRENDING = [
  { tag: 'MLB', posts: '2.4K', hot: true },
  { tag: 'HomeRunDerby', posts: '1.8K', hot: true },
  { tag: 'NFL', posts: '1.1K', hot: false },
  { tag: 'Ohtani', posts: '890', hot: false },
  { tag: 'DraftKings', posts: '712', hot: false },
  { tag: 'NBA', posts: '643', hot: false },
]

export async function RightSidebar() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  let suggested: any[] = []
  if (user) {
    const { data: following } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id)

    const followingIds = (following ?? []).map((f: any) => f.following_id)
    const exclude = [...followingIds, user.id]

    const { data } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, is_verified, account_type, follower_count')
      .not('id', 'in', `(${exclude.join(',') || user.id})`)
      .order('follower_count', { ascending: false })
      .limit(5)
    suggested = (data as any[]) ?? []
  } else {
    const { data } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, is_verified, account_type, follower_count')
      .order('follower_count', { ascending: false })
      .limit(5)
    suggested = (data as any[]) ?? []
  }

  return (
    <aside className="w-72 shrink-0 sticky top-0 h-screen overflow-y-auto hidden xl:flex flex-col gap-4 py-4 pr-4">
      {/* Trending */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={14} className="text-green-400" />
          <span className="text-sm font-black text-white">Trending</span>
        </div>
        <div className="space-y-1">
          {TRENDING.map((t, i) => (
            <Link key={t.tag} href={`/hashtag/${t.tag.toLowerCase()}`}
              className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-zinc-800 transition-colors group">
              <div>
                <p className="text-xs text-zinc-500 group-hover:text-zinc-400">#{i + 1} · Sports</p>
                <p className="text-sm font-bold text-white group-hover:text-green-400 transition-colors">#{t.tag}</p>
                <p className="text-xs text-zinc-600">{t.posts} posts</p>
              </div>
              {t.hot && (
                <span className="text-[10px] font-black text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded-full">HOT</span>
              )}
            </Link>
          ))}
        </div>
      </div>

      {/* Suggested Users */}
      {suggested.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users size={14} className="text-blue-400" />
            <span className="text-sm font-black text-white">Who to follow</span>
          </div>
          <SuggestedUsers users={suggested} currentUserId={user?.id ?? null} />
          <Link href="/creators" className="block text-xs text-green-400 hover:underline mt-3 text-center">
            Show more
          </Link>
        </div>
      )}

      {/* Footer */}
      <div className="px-2">
        <p className="text-[10px] text-zinc-700 leading-relaxed">
          SlipSurge · <Link href="/about" className="hover:text-zinc-500">About</Link>{' '}·{' '}
          <Link href="/settings/privacy" className="hover:text-zinc-500">Privacy</Link>{' '}·{' '}
          <Link href="/settings" className="hover:text-zinc-500">Settings</Link>
        </p>
        <p className="text-[10px] text-zinc-800 mt-1">© 2026 SlipSurge</p>
      </div>
    </aside>
  )
}
