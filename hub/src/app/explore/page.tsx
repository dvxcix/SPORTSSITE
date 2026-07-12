import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { TrendingUp, Flame, Users, Hash } from 'lucide-react'
import { sportLogoUrl } from '@/lib/sportLogos'
import { getTeamLogoUrl } from '@/lib/mlbTeamColors'

export const revalidate = 300

export default async function ExplorePage() {
  const supabase = await createClient()

  const [{ data: topUsers }, { data: topPosts }, { data: trendingPicks }] = await Promise.all([
    supabase.from('users')
      .select('id, username, display_name, avatar_url, is_verified, account_type, follower_count, pick_record')
      .eq('is_active_member', true)
      .order('follower_count', { ascending: false })
      .limit(6),
    supabase.from('posts')
      .select('id, content, sport, post_type, pick_data, reaction_count, comment_count, created_at, author:users(username, display_name, avatar_url)')
      .eq('visibility', 'public')
      .gte('created_at', new Date(Date.now() - 86400000).toISOString())
      .order('reaction_count', { ascending: false })
      .limit(5),
    supabase.from('posts')
      .select('id, content, pick_data, sport, reaction_count, created_at, author:users(username, display_name)')
      .eq('post_type', 'pick')
      .eq('visibility', 'public')
      .gte('created_at', new Date(Date.now() - 86400000).toISOString())
      .order('reaction_count', { ascending: false })
      .limit(8),
  ])

  const SPORTS = [
    { label: 'MLB', emoji: '⚾', href: '/hashtag/mlb' },
    { label: 'NFL', emoji: '🏈', href: '/hashtag/nfl' },
    { label: 'NBA', emoji: '🏀', href: '/hashtag/nba' },
    { label: 'NHL', emoji: '🏒', href: '/hashtag/nhl' },
    { label: 'Soccer', emoji: '⚽', href: '/hashtag/soccer' },
    { label: 'MMA', emoji: '🥊', href: '/hashtag/mma' },
  ]

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
      {/* Sport categories */}
      <section>
        <h2 className="text-sm font-bold text-zinc-400 mb-3 flex items-center gap-2">
          <Hash size={14} /> Browse by Sport
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {SPORTS.map(s => {
            const logo = sportLogoUrl(s.label)
            return (
              <Link key={s.label} href={s.href}
                className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-3 hover:border-zinc-700 hover:bg-zinc-800/50 transition-all">
                {logo ? <img src={logo} alt={s.label} className="w-6 h-6 object-contain shrink-0" /> : <span className="text-xl">{s.emoji}</span>}
                <span className="font-bold text-white text-sm">{s.label}</span>
              </Link>
            )
          })}
        </div>
      </section>

      {/* Trending picks */}
      {(trendingPicks?.length ?? 0) > 0 && (
        <section>
          <h2 className="text-sm font-bold text-zinc-400 mb-3 flex items-center gap-2">
            <TrendingUp size={14} /> Hot Picks Today
          </h2>
          <div className="space-y-2">
            {(trendingPicks ?? []).map((p: any) => {
              const sportLogo = sportLogoUrl(p.sport)
              const teamLogo = getTeamLogoUrl(p.pick_data?.team)
              return (
                <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 hover:border-zinc-700 transition-all">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-zinc-500">@{p.author?.display_name || p.author?.username}</span>
                    {p.sport && (
                      sportLogo
                        ? <img src={sportLogo} alt={p.sport} className="w-4 h-4 object-contain shrink-0" />
                        : <span className="text-[10px] font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded-full">{p.sport}</span>
                    )}
                    <span className="ml-auto text-xs text-zinc-600">❤️ {p.reaction_count}</span>
                  </div>
                  {p.pick_data && (
                    <div className="flex items-center gap-2">
                      <TrendingUp size={11} className="text-yellow-400 shrink-0" />
                      {teamLogo
                        ? <img src={teamLogo} alt={p.pick_data.team} className="w-5 h-5 object-contain shrink-0" />
                        : <span className="text-sm font-bold text-white">{p.pick_data.team}</span>}
                      <span className="text-xs text-zinc-500">{p.pick_data.line}</span>
                      <span className="text-xs font-mono font-bold text-zinc-300">{p.pick_data.odds}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Top posts */}
      {(topPosts?.length ?? 0) > 0 && (
        <section>
          <h2 className="text-sm font-bold text-zinc-400 mb-3 flex items-center gap-2">
            <Flame size={14} /> Top Posts (24h)
          </h2>
          <div className="space-y-2">
            {(topPosts ?? []).map((p: any) => {
              const sportLogo = sportLogoUrl(p.sport)
              return (
                <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 hover:border-zinc-700 transition-all">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-5 h-5 rounded-full bg-zinc-700 overflow-hidden shrink-0">
                      {p.author?.avatar_url && <img src={p.author.avatar_url} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <Link href={`/profile/${p.author?.username}`} className="text-xs font-bold text-zinc-400 hover:text-white">@{p.author?.username}</Link>
                    {p.sport && (
                      sportLogo
                        ? <img src={sportLogo} alt={p.sport} className="w-4 h-4 object-contain shrink-0" />
                        : <span className="text-[10px] font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded-full">{p.sport}</span>
                    )}
                    <span className="ml-auto text-xs text-zinc-600">❤️ {p.reaction_count} · 💬 {p.comment_count}</span>
                  </div>
                  <p className="text-sm text-zinc-200 line-clamp-2">{p.content}</p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Top creators */}
      {(topUsers?.length ?? 0) > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-zinc-400 flex items-center gap-2">
              <Users size={14} /> Top Cappers
            </h2>
            <Link href="/leaderboard" className="text-xs text-green-400 hover:text-green-300">See all →</Link>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(topUsers ?? []).map((u: any) => (
              <Link key={u.id} href={`/profile/${u.username}`}
                className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-3 hover:border-zinc-700 transition-all">
                <div className="w-10 h-10 rounded-full bg-zinc-700 shrink-0 flex items-center justify-center text-sm font-black text-white overflow-hidden">
                  {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : (u.display_name || u.username)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white text-xs truncate">{u.display_name || u.username}</p>
                  <p className="text-[10px] text-zinc-500">{u.follower_count ?? 0} followers</p>
                  {u.pick_record && (
                    <p className="text-[10px] font-bold text-green-400">{u.pick_record.wins}W-{u.pick_record.losses}L</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
