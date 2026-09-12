'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Search, TrendingUp, Users, Zap, Hash, Activity, BadgeCheck, LayoutGrid, ArrowRight, Bookmark, BookmarkCheck, Clock3, X } from 'lucide-react'
import { PlayerAvatar, TeamLogo } from '@/components/sports/PlayerAvatar'
import { mlbHeadshot, mlbTeamLogo } from '@slipsurge/core/mlb-api'
import { UserBadges } from '@/components/social/UserBadges'
import { sportLogoUrl } from '@/lib/sportLogos'
import { getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import { NflTeamLogo } from '@/components/shared/NflTeamLogo'
import { getBlockedEitherWayIds } from '@/lib/blocks'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { ProductHero, ProductPageShell } from '@/components/product/ProductPage'
import { SafeImage } from '@/components/ui/SafeImage'

type SearchTab = 'all' | 'users' | 'posts' | 'picks' | 'community' | 'mlb' | 'nfl'

const TRENDING_TAGS = ['MLB', 'Yankees', 'Dodgers', 'OverUnder', 'NFL2026', 'Props', 'Parlays', 'NBA']
const RECENT_SEARCHES_KEY = 'slipsurge:recent-searches'

type MlbPlayerResult = { mlbId: number; name: string; position: string | null; teamId: number | null; teamName: string | null; gamePk: number | null; isProbableStarter: boolean }
type MlbTeamResult = { id: number; abbr: string; name: string; shortName: string; gamePk: number | null }
type NflPlayerResult = { gsis_id: string; display_name: string; position: string | null; latest_team: string | null; headshot: string | null; team_logo_espn: string | null }
type NflTeamResult = { team_abbr: string; team_name: string; team_nick: string | null; team_logo_espn: string | null }
type CommunityResult = { id: string; slug: string; name: string; description: string | null; avatar_url: string | null; emoji: string | null; count: number }
type EventResult = { id: string; title: string; description: string | null; cover_image: string | null; start_date: string; going_count: number | null }
type SavedSearch = { id: string; query: string; result_tab: SearchTab; last_used_at: string }

export function SearchClient() {
  // The topbar's search box links here with ?q= already filled in — read
  // it once on mount so landing here doesn't mean retyping what you just
  // typed. Still just an initial value, not a live sync back to the URL
  // (no need — this page owns the query from here on).
  const searchParams = useSearchParams()
  const router = useRouter()
  const [q, setQ] = useState(() => searchParams.get('q') ?? '')
  const [tab, setTab] = useState<SearchTab>('all')
  const [users, setUsers] = useState<any[]>([])
  const [posts, setPosts] = useState<any[]>([])
  const [players, setPlayers] = useState<MlbPlayerResult[]>([])
  const [teams, setTeams] = useState<MlbTeamResult[]>([])
  const [mlbDate, setMlbDate] = useState<string | null>(null)
  const [nflPlayers, setNflPlayers] = useState<NflPlayerResult[]>([])
  const [nflTeams, setNflTeams] = useState<NflTeamResult[]>([])
  const [groups, setGroups] = useState<CommunityResult[]>([])
  const [pages, setPages] = useState<CommunityResult[]>([])
  const [channels, setChannels] = useState<CommunityResult[]>([])
  const [events, setEvents] = useState<EventResult[]>([])
  const [loading, setLoading] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [savingSearch, setSavingSearch] = useState(false)
  const [saveError, setSaveError] = useState('')
  const supabase = useMemo(() => createClient(), [])
  const searchRunRef = useRef(0)
  // Fetched once on mount rather than inside doSearch (which fires on every
  // debounced keystroke) — read via the ref so the memoized callback always
  // sees the latest value without needing blockedIds in its dependency array.
  const blockedIdsRef = useRef<string[]>([])
  useEffect(() => {
    let cancelled = false
    try {
      const saved = JSON.parse(window.localStorage.getItem(RECENT_SEARCHES_KEY) ?? '[]')
      if (Array.isArray(saved)) {
        const next = saved.filter(value => typeof value === 'string').slice(0, 6)
        queueMicrotask(() => { if (!cancelled) setRecentSearches(next) })
      }
    } catch {
      window.localStorage.removeItem(RECENT_SEARCHES_KEY)
    }
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setCurrentUserId(user.id)
      getBlockedEitherWayIds(supabase, user.id).then(ids => { blockedIdsRef.current = ids })
      supabase.from('saved_searches').select('id,query,result_tab,last_used_at').eq('user_id', user.id).order('last_used_at', { ascending: false }).limit(12)
        .then(({ data }) => setSavedSearches((data ?? []) as SavedSearch[]))
    })
  }, [supabase])

  const doSearch = useCallback(async (query: string) => {
    const runId = ++searchRunRef.current
    if (!query.trim()) { setUsers([]); setPosts([]); setPlayers([]); setTeams([]); setNflPlayers([]); setNflTeams([]); setGroups([]); setPages([]); setChannels([]); setEvents([]); setLoading(false); return }
    setLoading(true)
    const filterQuery = query.replace(/[,%()]/g, ' ').trim().slice(0, 64)

    const postCols = 'id, content, post_type, pick_data, sport, created_at, author_id, author:users!posts_author_id_fkey(username, display_name, avatar_url)'
    const [{ data: u }, { data: byContent }, { data: recentPicks }, { data: groupRows }, { data: pageRows }, { data: channelRows }, { data: eventRows }, sportsData, nflData] = await Promise.all([
      supabase.from('users')
        .select('id, username, display_name, avatar_url, is_verified, account_type, follower_count, pick_record')
        .or(`username.ilike.%${filterQuery}%,display_name.ilike.%${filterQuery}%`)
        .limit(8),
      // Plain ilike, not full-text search — a partial/mid-word type-ahead
      // like "mach" finding "Machado" matches how people actually use a
      // search box better than websearch_to_tsquery's whole-word stemming.
      supabase.from('posts').select(postCols)
        .ilike('content', `%${filterQuery}%`)
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(15),
      // A player's name usually only lives inside pick_data — the
      // top-level player_name for a single pick, nested inside legs[] for
      // a parlay — not the caption, so content-only search was silently
      // missing every pick post where nobody happened to also type the
      // player's name into their own caption. PostgREST's or=() logic tree
      // doesn't accept a `column::type` cast (confirmed live — it 400s
      // with PGRST100, which the old code silently swallowed since only
      // `data` was destructured, never `error`), so this can't be one
      // query; fetch a bounded recent window of picks/parlays and match
      // the whole pick_data blob client-side instead, then merge+dedupe
      // with the content matches above.
      supabase.from('posts').select(postCols)
        .in('post_type', ['pick', 'parlay'])
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(150),
      supabase.from('groups').select('id,slug,name,description,avatar_url,emoji,member_count').eq('is_public', true).or(`name.ilike.%${filterQuery}%,description.ilike.%${filterQuery}%`).order('member_count', { ascending: false }).limit(8),
      supabase.from('pages').select('id,slug,name,description,avatar_url,emoji,follower_count').eq('is_published', true).or(`name.ilike.%${filterQuery}%,description.ilike.%${filterQuery}%`).order('follower_count', { ascending: false }).limit(8),
      supabase.from('channels').select('id,slug,name,description,icon,member_count').or(`name.ilike.%${filterQuery}%,description.ilike.%${filterQuery}%`).order('member_count', { ascending: false }).limit(8),
      supabase.from('events').select('id,title,description,cover_image,start_date,going_count').or(`title.ilike.%${filterQuery}%,description.ilike.%${filterQuery}%`).order('start_date', { ascending: true }).limit(8),
      fetch(`/api/search/sports?q=${encodeURIComponent(query)}`).then(r => r.ok ? r.json() : { players: [], teams: [] }).catch(() => ({ players: [], teams: [] })),
      fetch(`/api/search/nfl?q=${encodeURIComponent(query)}`).then(r => r.ok ? r.json() : { players: [], teams: [] }).catch(() => ({ players: [], teams: [] })),
    ])

    const q = query.toLowerCase()
    const byPickData = (recentPicks ?? []).filter((post: any) => JSON.stringify(post.pick_data ?? {}).toLowerCase().includes(q))
    const seen = new Set<string>()
    const blockedSet = new Set(blockedIdsRef.current)
    const p = [...(byContent ?? []), ...byPickData]
      .filter(post => (seen.has(post.id) ? false : (seen.add(post.id), true)))
      .filter((post: any) => !blockedSet.has(post.author?.id) && !blockedSet.has(post.author_id))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, 15)

    if (runId !== searchRunRef.current) return
    setUsers((u ?? []).filter((r: any) => !blockedSet.has(r.id)))
    setPosts(p)
    setPlayers(sportsData.players ?? [])
    setTeams(sportsData.teams ?? [])
    setMlbDate(sportsData.date ?? null)
    setNflPlayers(nflData.players ?? [])
    setNflTeams(nflData.teams ?? [])
    setGroups((groupRows ?? []).map(group => ({ ...group, count: group.member_count ?? 0 })))
    setPages((pageRows ?? []).map(page => ({ ...page, count: page.follower_count ?? 0 })))
    setChannels((channelRows ?? []).map(channel => ({ id: channel.id, slug: channel.slug, name: channel.name, description: channel.description, avatar_url: null, emoji: channel.icon || '#', count: channel.member_count ?? 0 })))
    setEvents(eventRows ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    const t = setTimeout(() => doSearch(q), 300)
    return () => clearTimeout(t)
  }, [q, doSearch])

  function rememberSearch(value: string) {
    const normalized = value.trim()
    if (!normalized) return
    setRecentSearches(current => {
      const next = [normalized, ...current.filter(item => item.toLowerCase() !== normalized.toLowerCase())].slice(0, 6)
      window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next))
      return next
    })
  }

  function clearRecentSearches() {
    setRecentSearches([])
    window.localStorage.removeItem(RECENT_SEARCHES_KEY)
  }

  async function saveSearch() {
    const query = q.trim().slice(0, 64)
    if (!query || !currentUserId || savingSearch) return
    setSavingSearch(true); setSaveError('')
    const lastUsedAt = new Date().toISOString()
    const { data, error } = await supabase.from('saved_searches').upsert({
      user_id: currentUserId,
      query,
      query_key: query.toLocaleLowerCase(),
      result_tab: tab,
      last_used_at: lastUsedAt,
    }, { onConflict: 'user_id,query_key,result_tab' }).select('id,query,result_tab,last_used_at').single()
    setSavingSearch(false)
    if (error || !data) { setSaveError('Search not saved. Try again.'); return }
    setSavedSearches(current => [data as SavedSearch, ...current.filter(item => item.id !== data.id)].slice(0, 12))
  }

  async function removeSavedSearch(id: string) {
    const previous = savedSearches
    setSavedSearches(current => current.filter(item => item.id !== id))
    const { error } = await supabase.from('saved_searches').delete().eq('id', id).eq('user_id', currentUserId)
    if (error) { setSavedSearches(previous); setSaveError('Saved search not removed. Try again.') }
  }

  async function openSavedSearch(saved: SavedSearch) {
    setQ(saved.query); setTab(saved.result_tab)
    const lastUsedAt = new Date().toISOString()
    setSavedSearches(current => current.map(item => item.id === saved.id ? { ...item, last_used_at: lastUsedAt } : item).sort((a, b) => b.last_used_at.localeCompare(a.last_used_at)))
    await supabase.from('saved_searches').update({ last_used_at: lastUsedAt }).eq('id', saved.id).eq('user_id', currentUserId)
  }

  // Picks used to only match post_type === 'pick', silently excluding
  // parlays — same bug already found/fixed on /feed and /picks.
  const picks = posts.filter(p => p.post_type === 'pick' || p.post_type === 'parlay')
  const hasResults = users.length > 0 || posts.length > 0 || players.length > 0 || teams.length > 0 || nflPlayers.length > 0 || nflTeams.length > 0 || groups.length > 0 || pages.length > 0 || channels.length > 0 || events.length > 0
  const showUsers = tab === 'all' || tab === 'users'
  const showPosts = tab === 'all' || tab === 'posts'
  const showPicks = tab === 'picks'
  const showMlb = tab === 'all' || tab === 'mlb'
  const showNfl = tab === 'all' || tab === 'nfl'
  const showCommunity = tab === 'all' || tab === 'community'

  return (
    <ProductPageShell narrow>
      <ProductHero icon={<Search size={21} />} eyebrow="Discover" title="Search SlipSurge" description="Players, teams, members, posts, and picks in one search." />
      {/* Search input */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          autoFocus
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') rememberSearch(q) }}
          onBlur={() => rememberSearch(q)}
          aria-label="Search SlipSurge"
          aria-busy={loading}
          placeholder="Search players, teams, picks, users…"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-24 py-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 focus:ring-1 ring-green-500/20 transition-all"
        />
        {currentUserId && q.trim() ? <button type="button" className="ss-search-save" disabled={savingSearch} onClick={saveSearch}>{savingSearch || loading ? <span aria-label={savingSearch ? 'Saving search' : 'Searching'} role="status" className="h-3.5 w-3.5 rounded-full border-2 border-zinc-600 border-t-green-400 animate-spin"/> : savedSearches.some(item => item.query.toLowerCase() === q.trim().toLowerCase() && item.result_tab === tab) ? <BookmarkCheck size={14}/> : <Bookmark size={14}/>}<span>Save</span></button> : loading ? <div aria-label="Searching" role="status" className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-zinc-600 border-t-green-400 rounded-full animate-spin"/> : null}
      </div>
      {saveError && <p role="alert" className="-mt-3 mb-4 text-xs font-semibold text-red-400">{saveError}</p>}

      {!q.trim() && (
        <div className="space-y-6">
          {savedSearches.length > 0 && <section aria-labelledby="saved-searches-heading">
            <h2 id="saved-searches-heading" className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-400"><Bookmark size={14}/> Saved searches</h2>
            <div className="ss-saved-searches">{savedSearches.map(item => <div key={item.id}><button type="button" onClick={() => void openSavedSearch(item)}><BookmarkCheck size={13}/><span><strong>{item.query}</strong><small>{item.result_tab === 'all' ? 'All results' : item.result_tab.toUpperCase()}</small></span></button><button type="button" aria-label={`Remove saved search ${item.query}`} onClick={() => void removeSavedSearch(item.id)}><X size={12}/></button></div>)}</div>
          </section>}
          {recentSearches.length > 0 && <section aria-labelledby="recent-searches-heading">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="recent-searches-heading" className="flex items-center gap-2 text-sm font-bold text-zinc-400"><Clock3 size={14} /> Recent</h2>
              <button type="button" onClick={clearRecentSearches} className="text-xs font-bold text-zinc-500 transition hover:text-white">Clear</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentSearches.map(item => <span key={item} className="inline-flex items-center overflow-hidden rounded-full border border-zinc-800 bg-zinc-900">
                <button type="button" onClick={() => setQ(item)} className="px-3 py-1.5 text-sm text-zinc-300 transition hover:text-white">{item}</button>
                <button type="button" aria-label={`Remove ${item} from recent searches`} onClick={() => {
                  const next = recentSearches.filter(value => value !== item)
                  setRecentSearches(next)
                  window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next))
                }} className="grid min-h-8 min-w-8 place-items-center border-l border-zinc-800 text-zinc-600 transition hover:text-white"><X size={12} /></button>
              </span>)}
            </div>
          </section>}
          <section aria-labelledby="trending-searches-heading">
          <h2 className="text-sm font-bold text-zinc-400 mb-3 flex items-center gap-2">
            <TrendingUp size={14} /> <span id="trending-searches-heading">Trending</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {TRENDING_TAGS.map(tag => (
              <button key={tag} onClick={() => setQ(tag)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-sm text-zinc-300 hover:border-green-500/50 hover:text-white transition-all">
                <Hash size={12} className="text-green-400" /> {tag}
              </button>
            ))}
          </div>
          </section>
        </div>
      )}

      {q.trim() && hasResults && (
        <>
          {/* Tabs */}
          <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900 p-1 scrollbar-hide">
            {([['all', 'All'], ['mlb', 'MLB'], ['nfl', 'NFL'], ['community', 'Community'], ['users', 'Users'], ['posts', 'Posts'], ['picks', 'Picks']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`min-w-16 flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-all ${tab === k ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
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
                    className="ss-search-result flex items-center gap-3 p-3">
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
                  <div key={p.mlbId} className="ss-search-result flex items-center gap-3 p-3">
                    <Link href={`/players/${p.mlbId}`} className="flex items-center gap-3 flex-1 min-w-0">
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
                    </Link>
                    <div className="flex gap-1.5 shrink-0">
                      <Link href={`/dugout?highlight=${p.mlbId}`}
                        className="text-[11px] font-bold border border-zinc-700 text-zinc-300 hover:bg-zinc-800 px-2.5 py-1.5 rounded-lg transition-colors">
                        Dugout
                      </Link>
                      {/* Only shown when this exact player is a probable
                          starter today — Pitcher Report is built around one
                          specific starting pitcher's own matchup, so it has
                          nothing real to show for a reliever or position
                          player, and linking there for every "P" result
                          regardless would just land on an empty state. */}
                      {p.isProbableStarter && (
                        <Link href={`/pitcher-report?date=${mlbDate ?? ''}&pitcherId=${p.mlbId}`}
                          className="text-[11px] font-bold border border-zinc-700 text-zinc-300 hover:bg-zinc-800 px-2.5 py-1.5 rounded-lg transition-colors">
                          Pitcher Report
                        </Link>
                      )}
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

          {showCommunity && (groups.length > 0 || pages.length > 0 || channels.length > 0 || events.length > 0) && (
            <div className="mb-6">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500"><LayoutGrid size={12}/> Community</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {groups.map(group => <CommunitySearchResult key={`group-${group.id}`} href={`/groups/${group.slug}`} item={group} label={`${group.count} members`} />)}
                {pages.map(page => <CommunitySearchResult key={`page-${page.id}`} href={`/pages/${page.slug}`} item={page} label={`${page.count} followers`} />)}
                {channels.map(channel => <CommunitySearchResult key={`channel-${channel.id}`} href={`/channels/${channel.slug}`} item={channel} label={`${channel.count} members`} />)}
                {events.map(event => <CommunitySearchResult key={`event-${event.id}`} href={`/events/${event.id}`} item={{ id:event.id, slug:event.id, name:event.title, description:event.description, avatar_url:event.cover_image, emoji:'◉', count:event.going_count ?? 0 }} label={`${event.going_count ?? 0} going · ${new Date(event.start_date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}`} />)}
              </div>
            </div>
          )}

          {/* NFL players & teams */}
          {showNfl && (nflPlayers.length > 0 || nflTeams.length > 0) && (
            <div className="mb-6">
              <h3 className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">
                🏈 NFL
              </h3>
              <div className="space-y-2">
                {nflTeams.map(t => (
                  <Link key={t.team_abbr} href={`/nfl/teams/${t.team_abbr}`}
                    className="ss-search-result flex items-center gap-3 p-3">
                    {t.team_logo_espn ? (
                      <SafeImage src={t.team_logo_espn} alt={t.team_abbr} className="h-10 w-10 shrink-0 object-contain" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-zinc-800 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-sm truncate">{t.team_name}</p>
                      <p className="text-xs text-zinc-500">Team</p>
                    </div>
                  </Link>
                ))}
                {nflPlayers.map(p => (
                  <Link key={p.gsis_id} href={`/nfl/players/${p.gsis_id}`}
                    className="ss-search-result flex items-center gap-3 p-3">
                    {p.headshot ? (
                      <SafeImage src={p.headshot} alt={p.display_name} className="h-11 w-11 shrink-0 rounded-full object-cover" />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-500 shrink-0">
                        {p.position || '—'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-sm truncate">{p.display_name}</p>
                      <p className="text-xs text-zinc-500 truncate flex items-center gap-1">
                        {p.position && <span>{p.position}</span>}
                        {p.position && p.latest_team && <span>·</span>}
                        {p.latest_team && <NflTeamLogo abbr={p.latest_team} logoUrl={p.team_logo_espn} size={14} />}
                      </p>
                    </div>
                  </Link>
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
                    className="ss-search-result flex items-center gap-3 p-3">
                    <MemberAvatar src={u.avatar_url} name={u.display_name || u.username} size={40} tone={u.account_type === 'creator' ? 'creator' : 'default'} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white text-sm truncate">{u.display_name || u.username}</span>
                        <UserBadges userId={u.id} size={13} />
                        {u.is_verified && <BadgeCheck size={14} className="text-green-400" aria-label="Verified" />}
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
                  <div
                    key={p.id}
                    onClick={e => {
                      const target = e.target as HTMLElement
                      if (target.closest('a, button, input, textarea, select')) return
                      router.push(`/posts/${p.id}`)
                    }}
                    className="ss-search-result p-3 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <MemberAvatar src={p.author?.avatar_url} name={p.author?.display_name || p.author?.username || 'Member'} size={24} />
                      <Link href={`/profile/${p.author?.username}`} className="text-xs font-bold text-zinc-400 hover:text-white">
                        @{p.author?.username}
                      </Link>
                      {p.sport && (
                        sportLogoUrl(p.sport)
                          ? <SafeImage src={sportLogoUrl(p.sport)} alt={p.sport} className="h-3.5 w-3.5 shrink-0 object-contain" />
                          : <span className="text-[10px] font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded-full">{p.sport}</span>
                      )}
                      {p.post_type === 'parlay' && <span className="text-[10px] font-bold bg-yellow-400/10 text-yellow-400 px-1.5 py-0.5 rounded-full">PARLAY</span>}
                    </div>
                    <p className="text-sm text-zinc-200 leading-relaxed line-clamp-2">{p.content}</p>
                    {p.pick_data?.team && (
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <TrendingUp size={11} className="text-yellow-400" />
                        {getTeamLogoUrl(p.pick_data.team)
                          ? <SafeImage src={getTeamLogoUrl(p.pick_data.team)} alt={p.pick_data.team} className="h-4 w-4 shrink-0 object-contain" />
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
    </ProductPageShell>
  )
}

function CommunitySearchResult({ href, item, label }: { href: string; item: CommunityResult; label: string }) {
  return <Link href={href} className="ss-search-result group flex min-w-0 items-center gap-3 p-3"><span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/[.08] bg-white/[.04] text-lg"><SafeImage src={item.avatar_url} alt="" className="h-full w-full object-cover" fallback={item.emoji || '⚡'}/></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-white">{item.name}</strong><small className="mt-0.5 block truncate text-[11px] text-zinc-500">{item.description || label}</small><em className="mt-1 block text-[9px] font-bold not-italic text-zinc-600">{label}</em></span><ArrowRight size={14} className="shrink-0 text-zinc-700 transition group-hover:translate-x-0.5 group-hover:text-lime-300"/></Link>
}
