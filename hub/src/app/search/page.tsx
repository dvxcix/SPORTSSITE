'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Search, TrendingUp, Users, Zap, Hash } from 'lucide-react'

type SearchTab = 'all' | 'users' | 'posts' | 'picks'

const TRENDING_TAGS = ['MLB', 'Yankees', 'Dodgers', 'OverUnder', 'NFL2026', 'Props', 'Parlays', 'NBA']

export default function SearchPage() {
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<SearchTab>('all')
  const [users, setUsers] = useState<any[]>([])
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const doSearch = useCallback(async (query: string) => {
    if (!query.trim()) { setUsers([]); setPosts([]); return }
    setLoading(true)

    const [{ data: u }, { data: p }] = await Promise.all([
      supabase.from('users')
        .select('id, username, display_name, avatar_url, is_verified, account_type, follower_count, pick_record')
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .limit(8),
      supabase.from('posts')
        .select('id, content, post_type, pick_data, sport, created_at, author:users(username, display_name, avatar_url)')
        .textSearch('content', query, { type: 'websearch' })
        .eq('visibility', 'public')
        .limit(10),
    ])

    setUsers(u ?? [])
    setPosts(p ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => doSearch(q), 300)
    return () => clearTimeout(t)
  }, [q, doSearch])

  const hasResults = users.length > 0 || posts.length > 0
  const showUsers = tab === 'all' || tab === 'users'
  const showPosts = tab === 'all' || tab === 'posts'
  const showPicks = tab === 'picks'

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Search input */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          autoFocus
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search players, picks, users, teams…"
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
            {([['all', 'All'], ['users', 'Users'], ['posts', 'Posts'], ['picks', 'Picks']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === k ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                {l}
              </button>
            ))}
          </div>

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

          {/* Posts */}
          {(showPosts || showPicks) && posts.length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">
                <Zap size={12} /> {showPicks ? 'Picks' : 'Posts'}
              </h3>
              <div className="space-y-2">
                {posts.filter(p => !showPicks || p.post_type === 'pick').map((p: any) => (
                  <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 hover:border-zinc-700 transition-all">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-full bg-zinc-700 shrink-0 overflow-hidden">
                        {p.author?.avatar_url ? <img src={p.author.avatar_url} alt="" className="w-full h-full object-cover" /> : null}
                      </div>
                      <Link href={`/profile/${p.author?.username}`} className="text-xs font-bold text-zinc-400 hover:text-white">
                        @{p.author?.username}
                      </Link>
                      {p.sport && <span className="text-[10px] font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded-full">{p.sport}</span>}
                    </div>
                    <p className="text-sm text-zinc-200 leading-relaxed line-clamp-2">{p.content}</p>
                    {p.pick_data && (
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <TrendingUp size={11} className="text-yellow-400" />
                        <span className="font-bold text-white">{p.pick_data.team}</span>
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
