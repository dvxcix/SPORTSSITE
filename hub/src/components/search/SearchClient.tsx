'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Search, TrendingUp, Users, Zap, Hash, Activity } from 'lucide-react'
import { PlayerAvatar, TeamLogo } from '@/components/sports/PlayerAvatar'
import { mlbHeadshot, mlbTeamLogo } from '@/lib/mlb-api'
import { UserBadges } from '@/components/social/UserBadges'
import { sportLogoUrl } from '@/lib/sportLogos'
import { getTeamLogoUrl } from '@/lib/mlbTeamColors'

type SearchTab = 'all' | 'users' | 'posts' | 'picks' | 'mlb'

const TRENDING_TAGS = ['MLB', 'Yankees', 'Dodgers', 'OverUnder', 'NFL2026', 'Props', 'Parlays', 'NBA']

type MlbPlayerResult = { mlbId: number; name: string; position: string | null; teamId: number | null; teamName: string | null; gamePk: number | null }
type MlbTeamResult = { id: number; abbr: string; name: string; shortName: string; gamePk: number | null }

export function SearchClient() {
  // The topbar's search box links here with ?q= already filled in — read
  // it once on mount so landing here doesn't mean retyping what you just
  // typed. Still just an initial value, not a live sync back to the URL
  // (no need — this page owns the query from here on).
  const searchParams = useSearchParams()
  const [q, setQ] = useState(() => searchParams.get('q') ?? '')
  const [tab, setTab] = useState<SearchTab>('all')
  const [users, setUsers] = useState<any[]>([])
  const [posts, setPosts] = useState<any[]>([])
  const [players, setPlayers] = useState<MlbPlayerResult[]>([])
  const [teams, setTeams] = useState<MlbTeamResult[]>([])
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const doSearch = useCallback(async (query: string) => {
    if (!query.trim()) { setUsers([]); setPosts([]); setPlayers([]); setTeams([]); return }
    setLoading(true)

    const [{ data: u }, { data: p }, sportsData] = await Promise.all([
      supabase.from('users')
        .select('id, username, display_name, avatar_url, is_verified, account_type, follower_count, pick_record')
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .limit(8),
      // Plain ilike, not full-text search — a partial/mid-word type-ahead
      // like "mach" finding "Machado" matches how people actually use a
      // search box better than websearch_to_tsquery's whole-word stemming.
      supabase.from('posts')
        .select('id, content, post_type, pick_data, sport, created_at, author:users(username, display_name, avatar_url)')
        .ilike('content', `%${query}%`)
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(15),
      fetch(`/api/search/sports?q=${encodeURIComponent(query)}`).then(r => r.ok ? r.json() : { players: [], teams: [] }).catch(() => ({ players: [], teams: [] })),
    ])

    setUsers(u ?? [])
    setPosts(p ?? [])
    setPlayers(sportsData.players ?? [])
    setTeams(sportsData.teams ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => doSearch(q), 300)
    return () => clearTimeout(t)
  }, [q, doSearch])

  // Picks used to only match post_type === 'pick', silently excluding
  // parlays — same bug already found/fixed on /feed and /picks.
  const picks = posts.filter(p => p.post_type === 'pick' || p.post_type === 'parlay')
  const hasResults = users.length > 0 || posts.length > 0 || players.length > 0 || teams.length > 0
  const showUsers = tab === 'all' || tab === 'users'
  const showPosts = tab === 'all' || tab === 'posts'
  const showPicks = tab === 'picks'
  const showMlb = tab === 'all' || tab === 'mlb'

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Search input */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          autoFocus
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search players, teams, picks, users…"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 focus:ring-1 ring-green-500/20 transition-all"
        />
        {loading && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-zinc-600 border-t-green-400 rounded-full animate-spin" />
        )}
      </div>

      {!q.trim() && (
        <div>
          <h2 className="text-sm font-bold text-zinc-400 mb-3 flex items-center gap-2">
            <TrendingUp size={14} /> Trending
          </h2>
          <div className="flex flex-wrap gap-2">
            {TRENDING_TAGS.map(tag => (
              <button key={tag} onClick={() => setQ(tag)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-sm text-zinc-300 hover:border-green-500/50 hover:text-white transition-all">
                <Hash size={12} className="text-green-400" /> {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {q.trim() && hasResults && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 mb-4 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
            {([['all', 'All'], ['mlb', 'MLB'], ['users', 'Users'], ['posts', 'Posts'], ['picks', 'Picks']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === k ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                {l}
              </button>
            ))}
          </div>

          {/* MLB players & teams */}
          {showMlb && (players.length > 0 || teams.length > 0) && (
            <div className="mb-6">
              <h3 className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">
                <Activity size={12} /> MLB
              </h3>
              <div className="space-y-2">
                {teams.map(t => (
                  <Link key={t.abbr} href={t.gamePk ? `/sports/mlb/${t.gamePk}` : '/sports'}
                    className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-3 hover:border-zinc-700 transition-all">
                    <TeamLogo logo={mlbTeamLogo(t.id)} name={t.abbr} size={40} />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-sm truncate">{t.name}</p>
                      <p className="text-xs text-zinc-500">{t.gamePk ? 'Playing today · tap for live game' : 'Team'}</p>
                    </div>
                    {t.gamePk && (
                      <span className="text-[10px] font-black text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" /> LIVE
                      </span>
                    )}
                  </Link>
                ))}
                {players.map(p => (
                  <div key={p.mlbId} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                    <PlayerAvatar
                      headshot={mlbHeadshot(p.mlbId)}
                      teamLogo={p.teamId ? mlbTeamLogo(p.teamId) : null}
                      name={p.name}
                      size={44}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-sm truncate">{p.name}</p>
                      <p className="text-xs text-zinc-500 truncate">
                        {p.position && <span>{p.position}</span>}
                        {p.position && p.teamName && <span> · </span>}
                        {p.teamName}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Link href={`/dugout?highlight=${p.mlbId}`}
                        className="text-[11px] font-bold border border-zinc-700 text-zinc-300 hover:bg-zinc-800 px-2.5 py-1.5 rounded-lg transition-colors">
                        Dugout
                      </Link>
                      {p.gamePk && (
                        <Link href={`/sports/mlb/${p.gamePk}`}
                          className="text-[11px] font-bold bg-green-500 hover:bg-green-400 text-black px-2.5 py-1.5 rounded-lg transition-colors">
                          Live
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Users */}
          {showUsers && users.length > 0 && (
            <div className="mb-6">
              <h3 className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">
                <Users size={12} /> Users
              </h3>
              <div className="space-y-2">
                {users.map((u: any) => (
                  <Link key={u.id} href={`/profile/${u.username}`}
                    className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-3 hover:border-zinc-700 transition-all">
                    <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-black text-white overflow-hidden shrink-0">
                      {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : (u.display_name || u.username)[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white text-sm truncate">{u.display_name || u.username}</span>
                        <UserBadges userId={u.id} size={13} />
                        {u.is_verified && <span className="text-green-400 text-xs">✓</span>}
                        {u.account_type === 'creator' && <span className="text-[10px] font-bold text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded-full">PRO</span>}
                      </div>
                      <p className="text-xs text-zinc-500">@{u.username} · {u.follower_count ?? 0} followers</p>
                    </div>
                    {u.pick_record && (
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-green-400">{u.pick_record.wins}W</p>
                        <p className="text-xs text-zinc-500">{u.pick_record.losses}L</p>
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Posts / Picks */}
          {((showPosts && posts.length > 0) || (showPicks && picks.length > 0)) && (
            <div>
              <h3 className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">
                <Zap size={12} /> {showPicks ? 'Picks' : 'Posts'}
              </h3>
              <div className="space-y-2">
                {(showPicks ? picks : posts).map((p: any) => (
                  <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 hover:border-zinc-700 transition-all">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-full bg-zinc-700 shrink-0 overflow-hidden">
                        {p.author?.avatar_url ? <img src={p.author.avatar_url} alt="" className="w-full h-full object-cover" /> : null}
                      </div>
                      <Link href={`/profile/${p.author?.username}`} className="text-xs font-bold text-zinc-400 hover:text-white">
                        @{p.author?.username}
                      </Link>
                      {p.sport && (
                        sportLogoUrl(p.sport)
                          ? <img src={sportLogoUrl(p.sport)} alt={p.sport} className="w-3.5 h-3.5 object-contain shrink-0" />
                          : <span className="text-[10px] font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded-full">{p.sport}</span>
                      )}
                      {p.post_type === 'parlay' && <span className="text-[10px] font-bold bg-yellow-400/10 text-yellow-400 px-1.5 py-0.5 rounded-full">PARLAY</span>}
                    </div>
                    <Link href={`/posts/${p.id}`}>
                      <p className="text-sm text-zinc-200 leading-relaxed line-clamp-2">{p.content}</p>
                    </Link>
                    {p.pick_data?.team && (
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <TrendingUp size={11} className="text-yellow-400" />
                        {getTeamLogoUrl(p.pick_data.team)
                          ? <img src={getTeamLogoUrl(p.pick_data.team)} alt={p.pick_data.team} className="w-4 h-4 object-contain shrink-0" />
                          : <span className="font-bold text-white">{p.pick_data.team}</span>}
                        <span className="text-zinc-500">{p.pick_data.line}</span>
                        <span className="font-mono font-bold text-zinc-300">{p.pick_data.odds}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {q.trim() && !loading && !hasResults && (
        <div className="text-center py-16">
          <p className="text-3xl mb-3">🔍</p>
          <p className="text-zinc-400 font-medium">No results for "{q}"</p>
          <p className="text-zinc-600 text-sm mt-1">Try a different search term</p>
        </div>
      )}
    </div>
  )
}
