import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { TrendingUp, Users } from 'lucide-react'
import { SuggestedUsers } from '@/components/social/SuggestedUsers'

const HASHTAG_RE = /#(\w{2,})/g

function formatPostCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

// Was a hardcoded fake array (MLB/HomeRunDerby/Ohtani/etc with made-up
// counts) — /hashtag/[tag] already matches posts by sport OR a #tag in
// content, so real trending tags are derivable from that same data with no
// new schema: tally each recent public post's sport plus any #hashtags in
// its content, rank by count. Every resulting link lands on a page that
// actually shows matching posts, unlike the old static list.
async function getTrendingTags(supabase: Awaited<ReturnType<typeof createClient>>) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('posts')
    .select('content, sport')
    .eq('visibility', 'public')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500)

  const counts = new Map<string, number>()
  for (const post of (data as any[]) ?? []) {
    if (post.sport) {
      const tag = String(post.sport).toUpperCase()
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
    for (const m of String(post.content ?? '').matchAll(HASHTAG_RE)) {
      counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([tag, count], i) => ({ tag, count, hot: i < 2 && count >= 3 }))
}

export async function RightSidebar() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const trending = await getTrendingTags(supabase)

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
      {trending.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} className="text-green-400" />
            <span className="text-sm font-black text-white">Trending</span>
          </div>
          <div className="space-y-1">
            {trending.map((t, i) => (
              <Link key={t.tag} href={`/hashtag/${t.tag.toLowerCase()}`}
                className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-zinc-800 transition-colors group">
                <div>
                  <p className="text-xs text-zinc-500 group-hover:text-zinc-400">#{i + 1} · Trending</p>
                  <p className="text-sm font-bold text-white group-hover:text-green-400 transition-colors">#{t.tag}</p>
                  <p className="text-xs text-zinc-600">{formatPostCount(t.count)} posts</p>
                </div>
                {t.hot && (
                  <span className="text-[10px] font-black text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded-full">HOT</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

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
