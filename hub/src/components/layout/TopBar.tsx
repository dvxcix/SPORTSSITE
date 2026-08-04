'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, Bell, ChevronDown, LogOut, User, Settings, Shield, Heart, MessageCircle, UserPlus, AtSign, Trophy, Zap, Repeat2, Users, Menu, TrendingUp, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { PlayerAvatar, TeamLogo } from '@/components/sports/PlayerAvatar'
import { NflTeamLogo } from '@/components/shared/NflTeamLogo'
import { mlbHeadshot, mlbTeamLogo } from '@slipsurge/core/mlb-api'
import { useCustomEmojis } from '@/lib/emoji'
import { collapseConsecutiveFollows } from '@/components/social/NotificationsList'
import { effectiveTier, hasFullAccessOverride, type Tier } from '@slipsurge/core/tiers'
import { Badge } from '@/components/ui/badge'
import { getBlockedEitherWayIds } from '@/lib/blocks'

const TIER_LABEL: Record<Tier, string> = { free: 'Free', basic: 'Basic', advanced: 'Advanced', ultimate: 'Ultimate' }

const NOTIF_ICONS: Record<string, any> = {
  reaction: Heart, comment: MessageCircle, follow: UserPlus,
  mention: AtSign, pick_result: Trophy, message: MessageCircle, subscription: Zap, repost: Repeat2,
  group_invite: Users, new_pick: TrendingUp,
}

type NotifRow = {
  id: string; type: string; message: string | null; body: string | null
  link: string | null; read: boolean; created_at: string; actor_id?: string | null
  actor?: { username: string; display_name?: string; avatar_url?: string } | null
  data?: { avatar_url?: string; emoji?: string; team_logo?: string } | null
}

type QuickResults = {
  users: any[]; posts: any[]
  players: { mlbId: number; name: string; position: string | null; teamId: number | null; teamName: string | null }[]
  teams: { id: number; abbr: string; name: string; gamePk: number | null }[]
  nflPlayers: { gsis_id: string; display_name: string; position: string | null; latest_team: string | null; headshot: string | null; team_logo_espn: string | null }[]
  nflTeams: { team_abbr: string; team_name: string; team_logo_espn: string | null }[]
}
const EMPTY_RESULTS: QuickResults = { users: [], posts: [], players: [], teams: [], nflPlayers: [], nflTeams: [] }

export function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user, profile } = useAuth()
  const [search, setSearch] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [discordSyncing, setDiscordSyncing] = useState(false)
  const [discordSyncMsg, setDiscordSyncMsg] = useState('')
  const [notifOpen, setNotifOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [notifications, setNotifications] = useState<NotifRow[]>([])
  const customEmojis = useCustomEmojis()
  const router = useRouter()
  const supabase = createClient()
  const menuRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  // Read via the ref in both the notification-bell fetch and the quick-
  // search results below so neither needs to refetch or add this to a
  // dependency array — same pattern as SearchClient.tsx's own copy.
  const blockedIdsRef = useRef<string[]>([])

  // Live type-ahead preview — same data sources /search itself uses
  // (users/posts by ilike, MLB players/teams via the shared route), just
  // capped smaller since this is a glance-and-click dropdown, not the full
  // results page. Typing used to just sit there doing nothing until you
  // hit Enter and got dumped on /search with an EMPTY box, forcing a
  // retype of what you'd already typed.
  const [quickResults, setQuickResults] = useState<QuickResults>(EMPTY_RESULTS)
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickLoading, setQuickLoading] = useState(false)
  const searchRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    const query = search.trim()
    if (query.length < 2) { setQuickResults(EMPTY_RESULTS); setQuickLoading(false); return }
    let cancelled = false
    setQuickLoading(true)
    const t = setTimeout(async () => {
      const postCols = 'id, content, pick_data, author_id, author:users!posts_author_id_fkey(username, display_name)'
      const [{ data: u }, { data: byContent }, { data: recentPicks }, sportsData, nflData] = await Promise.all([
        supabase.from('users')
          .select('id, username, display_name, avatar_url')
          .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
          .limit(3),
        supabase.from('posts').select(postCols)
          .ilike('content', `%${query}%`)
          .eq('visibility', 'public')
          .order('created_at', { ascending: false })
          .limit(3),
        // Same content-then-pick_data merge as the full /search results page
        // (SearchClient.tsx) — a pick's player name usually only lives in
        // pick_data, not the caption, so content-only search missed it here
        // too. Can't do this as a single .or() query — PostgREST's logic
        // tree grammar rejects a `column::type` cast (confirmed live via a
        // PGRST100 parse error), so it's a separate bounded fetch merged
        // client-side instead.
        supabase.from('posts').select(postCols)
          .in('post_type', ['pick', 'parlay'])
          .eq('visibility', 'public')
          .order('created_at', { ascending: false })
          .limit(150),
        fetch(`/api/search/sports?q=${encodeURIComponent(query)}`).then(r => r.ok ? r.json() : { players: [], teams: [] }).catch(() => ({ players: [], teams: [] })),
        fetch(`/api/search/nfl?q=${encodeURIComponent(query)}`).then(r => r.ok ? r.json() : { players: [], teams: [] }).catch(() => ({ players: [], teams: [] })),
      ])
      if (cancelled) return
      const q = query.toLowerCase()
      const byPickData = (recentPicks ?? []).filter((post: any) => JSON.stringify(post.pick_data ?? {}).toLowerCase().includes(q))
      const seen = new Set<string>()
      const blockedSet = new Set(blockedIdsRef.current)
      const p = [...(byContent ?? []), ...byPickData]
        .filter(post => (seen.has(post.id) ? false : (seen.add(post.id), true)))
        .filter((post: any) => !blockedSet.has(post.author_id))
        .slice(0, 3)
      setQuickResults({
        users: (u ?? []).filter((r: any) => !blockedSet.has(r.id)), posts: p,
        players: (sportsData.players ?? []).slice(0, 3),
        teams: (sportsData.teams ?? []).slice(0, 2),
        nflPlayers: (nflData.players ?? []).slice(0, 3),
        nflTeams: (nflData.teams ?? []).slice(0, 2),
      })
      setQuickLoading(false)
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasQuickResults = quickResults.users.length > 0 || quickResults.posts.length > 0 || quickResults.players.length > 0 || quickResults.teams.length > 0 || quickResults.nflPlayers.length > 0 || quickResults.nflTeams.length > 0

  // Same effectiveTier() fold used everywhere else tier is checked or shown
  // (TierGate, requireTier, /pricing, /settings/membership) — the profile
  // dropdown is one more place someone can glance at their real access
  // level, so it can't show a different answer than any of those.
  const rawTier = (profile?.tier as Tier) ?? 'free'
  const currentTier = effectiveTier(rawTier, profile?.discord_advanced_claimed, profile?.admin_granted_tier as Tier | null | undefined)
  const fullAccess = hasFullAccessOverride(profile?.account_type, profile?.beta_access_active)
  const tierLabel = fullAccess ? (profile?.account_type === 'admin' ? 'Admin' : 'Beta — Full Access') : TIER_LABEL[currentTier]

  function goTo(href: string) {
    setQuickOpen(false)
    router.push(href)
  }

  useEffect(() => {
    if (!user) return
    getBlockedEitherWayIds(supabase, user.id).then(ids => {
      blockedIdsRef.current = ids
      let countQuery = supabase.from('notifications').select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('read', false)
      if (ids.length) countQuery = countQuery.not('actor_id', 'in', `(${ids.join(',')})`)
      countQuery.then(({ count }) => setUnread(count ?? 0))
    })

    // Live badge — bump the count the instant a new notification lands,
    // without the user needing to reload anything. A blocked actor's
    // notification will still insert (blocking doesn't stop the underlying
    // action, e.g. a like), so it's filtered against the same ref here too.
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload: any) => { if (!blockedIdsRef.current.includes(payload.new?.actor_id)) setUnread(c => c + 1) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  async function openNotifications() {
    const opening = !notifOpen
    setNotifOpen(opening)
    setMenuOpen(false)
    // Previously only fetched once ever (gated behind a one-time-set flag)
    // — the realtime subscription above bumps the unread badge on a new
    // notification, but the dropdown's actual list never refreshed after
    // that first load, so a genuinely new notification could be sitting
    // in the DB while the open dropdown kept showing stale contents.
    // Cheap enough (10 rows) to just refetch on every open.
    if (opening && user) {
      const { data } = await supabase
        .from('notifications')
        .select('id, type, message, body, link, read, created_at, data, actor_id, actor:users!notifications_actor_id_fkey(username, display_name, avatar_url)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10)
      const blockedSet = new Set(blockedIdsRef.current)
      setNotifications(((data as any) ?? []).filter((n: NotifRow) => !n.actor_id || !blockedSet.has(n.actor_id)))
    }
    if (opening && unread > 0 && user) {
      const prevUnread = unread
      setUnread(0)
      const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)
      if (error) { setUnread(prevUnread); return } // badge would under-report actual unread count otherwise
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    }
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setQuickOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function deleteNotif(ids: string | string[]) {
    const idList = Array.isArray(ids) ? ids : [ids]
    const prev = notifications
    setNotifications(p => p.filter(n => !idList.includes(n.id)))
    const { error } = await supabase.from('notifications').delete().in('id', idList).eq('user_id', user!.id)
    if (error) setNotifications(prev) // restore — it's still in the DB
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  // Self-serve re-sync for drift (a Discord-side role got manually removed,
  // a past sync attempt hit a transient failure, etc.) — the automatic path
  // already grants this at link time and every tier change, so this is a
  // safety net a member can pull themselves instead of waiting on an admin.
  async function claimDiscordRole() {
    setDiscordSyncing(true)
    setDiscordSyncMsg('')
    try {
      const res = await fetch('/api/discord/claim-role', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Sync failed')
      setDiscordSyncMsg('Synced ✓')
      setTimeout(() => setDiscordSyncMsg(''), 2000)
    } catch (e: any) {
      setDiscordSyncMsg(e?.message ?? 'Sync failed')
      setTimeout(() => setDiscordSyncMsg(''), 4000)
    } finally {
      setDiscordSyncing(false)
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (search.trim()) goTo(`/search?q=${encodeURIComponent(search.trim())}`)
  }

  return (
    <header style={{
      height: 'var(--topbar-h)',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '0 16px',
      // --banner-h is set by SiteBanner (0px when it's not showing) so this
      // sticks right below the banner instead of both pinning to literal
      // y:0 and overlapping once you scroll past the banner.
      position: 'sticky', top: 'var(--banner-h, 0px)', zIndex: 20,
    }}>
      {/* Hamburger — mobile only, opens the off-canvas sidebar drawer.
          display must live in the className (flex / md:hidden), not inline
          style — an inline style="display:flex" would always beat the
          md:hidden class (inline styles win over any stylesheet rule
          regardless of specificity), so the button would never actually
          hide on desktop. */}
      {onMenuClick && (
        <button onClick={onMenuClick} className="flex md:hidden items-center justify-center" style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          background: 'transparent', border: '1px solid var(--border)',
          color: 'var(--text-2)', cursor: 'pointer',
        }}
        aria-label="Open menu">
          <Menu size={16} />
        </button>
      )}

      {/* Search */}
      <form ref={searchRef} onSubmit={handleSearch} style={{ flex: 1, maxWidth: 400, position: 'relative' }}>
        <Search size={14} style={{
          position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--text-3)', pointerEvents: 'none',
        }} />
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setQuickOpen(true) }}
          onFocus={e => { e.target.style.borderColor = 'var(--accent)'; setQuickOpen(true) }}
          onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          placeholder="Search picks, users, teams…"
          style={{
            width: '100%', paddingLeft: 32, paddingRight: 12,
            paddingTop: 7, paddingBottom: 7,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 999, fontSize: 13, color: 'var(--text-1)',
            outline: 'none', transition: 'border-color 150ms',
          }}
        />

        {quickOpen && search.trim().length >= 2 && (
          <div className="ss-dropdown" style={{
            position: 'absolute', left: 0, right: 0, top: 'calc(100% + 6px)',
            maxHeight: 420, overflowY: 'auto', zIndex: 50,
          }}>
            {quickLoading && !hasQuickResults ? (
              <div style={{ padding: '16px 14px', textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>Searching…</div>
            ) : !hasQuickResults ? (
              <div style={{ padding: '16px 14px', textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>No results for "{search.trim()}"</div>
            ) : (
              <>
                {quickResults.teams.map(t => (
                  <button key={`t-${t.abbr}`} onClick={() => goTo(t.gamePk ? `/sports/mlb/${t.gamePk}` : '/sports')}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                    className="notif-dropdown-item">
                    <TeamLogo logo={mlbTeamLogo(t.id)} name={t.abbr} size={26} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)' }}>{t.name}</span>
                    {t.gamePk && <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 900, color: 'var(--red)' }}>LIVE</span>}
                  </button>
                ))}
                {quickResults.players.map(p => (
                  <button key={`p-${p.mlbId}`} onClick={() => goTo(`/players/${p.mlbId}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                    className="notif-dropdown-item">
                    <PlayerAvatar headshot={mlbHeadshot(p.mlbId)} teamLogo={p.teamId ? mlbTeamLogo(p.teamId) : null} name={p.name} size={26} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{[p.position, p.teamName].filter(Boolean).join(' · ')}</div>
                    </div>
                  </button>
                ))}
                {quickResults.nflTeams.map(t => (
                  <button key={`nt-${t.team_abbr}`} onClick={() => goTo(`/nfl/teams/${t.team_abbr}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                    className="notif-dropdown-item">
                    {t.team_logo_espn
                      ? <img src={t.team_logo_espn} alt={t.team_abbr} style={{ width: 26, height: 26, objectFit: 'contain', flexShrink: 0 }} />
                      : <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--surface-3)', flexShrink: 0 }} />}
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)' }}>{t.team_name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 900, color: 'var(--text-3)' }}>NFL</span>
                  </button>
                ))}
                {quickResults.nflPlayers.map(p => (
                  <button key={`np-${p.gsis_id}`} onClick={() => goTo(`/nfl/players/${p.gsis_id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                    className="notif-dropdown-item">
                    {p.headshot
                      ? <img src={p.headshot} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      : <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--surface-3)', flexShrink: 0 }} />}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.display_name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span>{p.position}</span>
                        {p.position && p.latest_team && <span>·</span>}
                        {p.latest_team && <NflTeamLogo abbr={p.latest_team} logoUrl={p.team_logo_espn} size={12} />}
                      </div>
                    </div>
                  </button>
                ))}
                {quickResults.users.map(u => (
                  <button key={`u-${u.id}`} onClick={() => goTo(`/profile/${u.username}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                    className="notif-dropdown-item">
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--surface-3)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: 'var(--text-3)' }}>
                      {u.avatar_url ? <img src={u.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (u.display_name || u.username)[0].toUpperCase()}
                    </div>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)' }}>{u.display_name || u.username}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>@{u.username}</span>
                  </button>
                ))}
                {quickResults.posts.map(p => (
                  <button key={`post-${p.id}`} onClick={() => goTo(`/posts/${p.id}`)}
                    style={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%', padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                    className="notif-dropdown-item">
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)' }}>@{p.author?.username}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.content}</span>
                  </button>
                ))}
                <button onClick={() => goTo(`/search?q=${encodeURIComponent(search.trim())}`)} style={{
                  display: 'block', width: '100%', textAlign: 'center', padding: '10px', fontSize: 12, fontWeight: 700,
                  color: 'var(--accent)', background: 'transparent', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer',
                }}>
                  See all results for "{search.trim()}"
                </button>
              </>
            )}
          </div>
        )}
      </form>

      {/* Right controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
        {user ? (
          <>
            {/* Notifications */}
            <div ref={notifRef} style={{ position: 'relative' }}>
              <button onClick={openNotifications} style={{
                position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 36, height: 36, borderRadius: 8,
                background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--text-2)', cursor: 'pointer', transition: 'all 130ms',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}>
                <Bell size={15} />
                {unread > 0 && (
                  <span style={{
                    position: 'absolute', top: -4, right: -4,
                    background: 'var(--red)', color: '#fff',
                    fontSize: 9, fontWeight: 900, borderRadius: 99,
                    padding: '1px 4px', minWidth: 16, textAlign: 'center',
                    border: '2px solid var(--surface)',
                  }}>
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="ss-dropdown" style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 6px)',
                  width: 340, maxHeight: 420, overflowY: 'auto', zIndex: 50,
                }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>
                    Notifications
                  </div>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '28px 14px', textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>
                      You're all caught up
                    </div>
                  ) : (
                    collapseConsecutiveFollows(notifications).map(entry => {
                      // A back-to-back run of follow notifications collapses
                      // into one compact row here too, same as the full
                      // /notifications page — otherwise picking up several
                      // followers in a short span buries everything else in
                      // this small dropdown under one row per follower.
                      const isGroup = Array.isArray(entry)
                      const n = isGroup ? entry[0] : entry
                      const groupIds = isGroup ? entry.map(x => x.id) : [n.id]
                      const othersCount = isGroup ? entry.length - 1 : 0
                      const Icon = NOTIF_ICONS[n.type] ?? Bell
                      const actorName = n.actor?.display_name || n.actor?.username
                      const text = isGroup
                        ? `${actorName ? `${actorName} ` : ''}and ${othersCount} other${othersCount === 1 ? '' : 's'} followed you`
                        : (actorName ? `${actorName} ` : '') + (n.message || n.body || 'interacted with you')
                      // Same badge logic as the full /notifications page —
                      // actual emoji (or custom emoji image) for reactions,
                      // team logo for pick results, generic type icon
                      // otherwise.
                      let badge: React.ReactNode = <Icon size={8} style={{ color: 'var(--accent)' }} />
                      if (n.type === 'reaction' && n.data?.emoji) {
                        const custom = n.data.emoji.match(/^:([a-z0-9_]+):$/)
                        const customEmoji = custom ? customEmojis.find(e => e.code === custom[1]) : null
                        badge = customEmoji
                          ? <img src={customEmoji.image_url} alt={n.data.emoji} style={{ width: 9, height: 9, objectFit: 'contain' }} />
                          : <span style={{ fontSize: 8, lineHeight: 1 }}>{n.data.emoji}</span>
                      } else if (n.type === 'pick_result' && n.data?.team_logo) {
                        badge = <img src={n.data.team_logo} alt="" style={{ width: 11, height: 11, objectFit: 'contain' }} />
                      }
                      const inner = (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 32px 10px 14px' }}>
                          <div style={{ position: 'relative', flexShrink: 0 }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface-3)', overflow: 'hidden' }}>
                              {(n.actor?.avatar_url || n.data?.avatar_url) && (
                                // A team logo (lineup_confirmed) is a flat
                                // mark on a square/transparent canvas, not a
                                // portrait — cover crops right into it, so
                                // it needs contain + a little padding
                                // instead (same fix as NotificationsList).
                                <img
                                  src={n.actor?.avatar_url || n.data?.avatar_url}
                                  alt=""
                                  style={{
                                    width: '100%', height: '100%', boxSizing: 'border-box',
                                    objectFit: n.type === 'lineup_confirmed' ? 'contain' : 'cover',
                                    padding: n.type === 'lineup_confirmed' ? 5 : 0,
                                  }}
                                />
                              )}
                            </div>
                            <div style={{ position: 'absolute', bottom: -3, right: -3, width: 16, height: 16, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {badge}
                            </div>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 12.5, color: 'var(--text-1)', lineHeight: 1.4 }}>{text}</p>
                            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                              {new Date(n.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      )
                      return (
                        <div key={n.id} style={{ position: 'relative' }}>
                          {n.link ? (
                            <Link href={n.link} onClick={() => setNotifOpen(false)} style={{ textDecoration: 'none', display: 'block' }}
                              className="notif-dropdown-item">
                              {inner}
                            </Link>
                          ) : inner}
                          <button
                            onClick={e => { e.preventDefault(); e.stopPropagation(); deleteNotif(groupIds) }}
                            aria-label="Dismiss notification"
                            style={{
                              position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: '50%',
                              background: 'transparent', border: 'none', color: 'var(--text-3)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--red)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                            <X size={11} />
                          </button>
                        </div>
                      )
                    })
                  )}
                  <Link href="/notifications" onClick={() => setNotifOpen(false)} style={{
                    display: 'block', textAlign: 'center', padding: '10px', fontSize: 12, fontWeight: 700,
                    color: 'var(--accent)', textDecoration: 'none', borderTop: '1px solid var(--border)',
                  }}>
                    View all
                  </Link>
                </div>
              )}
            </div>

            {/* Avatar + menu */}
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button onClick={() => setMenuOpen(v => !v)} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px 5px 5px', borderRadius: 8,
                background: 'transparent', border: '1px solid var(--border)',
                cursor: 'pointer', transition: 'all 130ms',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: 'var(--accent-dim)', overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 900, color: 'var(--accent)',
                }}>
                  {profile?.avatar_url
                    ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : (profile?.display_name || profile?.username || '?')[0].toUpperCase()
                  }
                </div>
                <span className="hidden sm:inline" style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {profile?.display_name || profile?.username || 'Me'}
                </span>
                <ChevronDown size={12} style={{ color: 'var(--text-3)' }} />
              </button>

              {menuOpen && (
                <div className="ss-dropdown" style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 6px)',
                  minWidth: 180, zIndex: 50,
                }}>
                  <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                      {profile?.display_name || profile?.username}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>@{profile?.username}</div>
                    <Link href="/settings/membership" onClick={() => setMenuOpen(false)} style={{ display: 'inline-block', marginTop: 6, textDecoration: 'none' }}>
                      <Badge variant="save">{tierLabel}</Badge>
                    </Link>
                  </div>
                  <Link href={`/profile/${profile?.username}`} className="ss-dropdown-item" onClick={() => setMenuOpen(false)}>
                    <User size={14} /> My Profile
                  </Link>
                  <Link href="/settings" className="ss-dropdown-item" onClick={() => setMenuOpen(false)}>
                    <Settings size={14} /> Settings
                  </Link>
                  {profile?.account_type === 'admin' && (
                    <Link href="/admin" className="ss-dropdown-item" onClick={() => setMenuOpen(false)}>
                      <Shield size={14} /> Admin Panel
                    </Link>
                  )}
                  <button className="ss-dropdown-item" onClick={claimDiscordRole} disabled={discordSyncing} style={{ width: '100%', textAlign: 'left' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.955 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                    </svg>
                    {discordSyncMsg || (discordSyncing ? 'Syncing…' : 'Claim Discord Roles')}
                  </button>
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                  <button className="ss-dropdown-item danger" onClick={signOut}>
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/auth/login" style={{
              padding: '7px 14px', borderRadius: 8,
              fontSize: 12, fontWeight: 700, color: 'var(--text-2)',
              border: '1px solid var(--border)', textDecoration: 'none',
              transition: 'all 130ms',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}>
              Sign in
            </Link>
            <Link href="/auth/register" style={{
              padding: '7px 14px', borderRadius: 8,
              fontSize: 12, fontWeight: 800, color: 'var(--accent-fg)',
              background: 'var(--accent)', textDecoration: 'none',
              transition: 'background 130ms',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#C8FF6A')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'var(--accent)')}>
              Sign up free
            </Link>
          </div>
        )}
      </div>
    </header>
  )
}
