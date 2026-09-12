'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, Bell, ChevronDown, ChevronRight, LogOut, User, Settings, Shield, Heart, MessageCircle, UserPlus, AtSign, Trophy, Zap, Repeat2, Users, Menu, TrendingUp, X, Sparkles, WalletCards, CheckCheck, Bookmark, CreditCard, CircleHelp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { PlayerAvatar, TeamLogo } from '@/components/sports/PlayerAvatar'
import { NflTeamLogo } from '@/components/shared/NflTeamLogo'
import { mlbHeadshot, mlbTeamLogo } from '@slipsurge/core/mlb-api'
import { useCustomEmojis, type CustomEmoji } from '@/lib/emoji'
import { collapseConsecutiveFollows } from '@/components/social/NotificationsList'
import { effectiveTier, hasFullAccessOverride, type Tier } from '@slipsurge/core/tiers'
import { Badge } from '@/components/ui/badge'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { getBlockedEitherWayIds } from '@/lib/blocks'
import { SafeImage } from '@/components/ui/SafeImage'

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

type NotificationFilter = 'all' | 'unread' | 'mentions'

type QuickResults = {
  users: any[]; posts: any[]
  players: { mlbId: number; name: string; position: string | null; teamId: number | null; teamName: string | null }[]
  teams: { id: number; abbr: string; name: string; gamePk: number | null }[]
  nflPlayers: { gsis_id: string; display_name: string; position: string | null; latest_team: string | null; headshot: string | null; team_logo_espn: string | null }[]
  nflTeams: { team_abbr: string; team_name: string; team_logo_espn: string | null }[]
}
const EMPTY_RESULTS: QuickResults = { users: [], posts: [], players: [], teams: [], nflPlayers: [], nflTeams: [] }

function compactTimeAgo(date: string) {
  const elapsed = Math.max(0, Date.now() - new Date(date).getTime())
  const minutes = Math.floor(elapsed / 60000)
  if (minutes < 1) return 'Now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function TopbarNotificationEntry({
  entry,
  customEmojis,
  onOpen,
  onDelete,
}: {
  entry: NotifRow | NotifRow[]
  customEmojis: CustomEmoji[]
  onOpen: (notifications: NotifRow[]) => void
  onDelete: (ids: string[]) => void
}) {
  const items = Array.isArray(entry) ? entry : [entry]
  const notification = items[0]
  const unread = items.some(item => !item.read)
  const Icon = NOTIF_ICONS[notification.type] ?? Bell
  const actorName = notification.actor?.display_name || notification.actor?.username
  const message = items.length > 1
    ? `${actorName ? `${actorName} ` : ''}and ${items.length - 1} other${items.length === 2 ? '' : 's'} followed you`
    : `${actorName ? `${actorName} ` : ''}${notification.message || notification.body || 'interacted with you'}`
  let badge: React.ReactNode = <Icon size={10} />
  if (notification.type === 'reaction' && notification.data?.emoji) {
    const customCode = notification.data.emoji.match(/^:([a-z0-9_]+):$/)?.[1]
    const customEmoji = customCode ? customEmojis.find(emoji => emoji.code === customCode) : null
    badge = customEmoji
      ? <SafeImage src={customEmoji.image_url} alt={notification.data.emoji} className="ss-topbar-notification-badge-image" />
      : <span className="ss-topbar-notification-emoji">{notification.data.emoji}</span>
  } else if (notification.type === 'pick_result' && notification.data?.team_logo) {
    badge = <SafeImage src={notification.data.team_logo} alt="" className="ss-topbar-notification-badge-image" />
  }

  const content = (
    <>
      <div className="ss-topbar-notification-avatar">
        {notification.type === 'lineup_confirmed' ? (
          <SafeImage src={notification.data?.avatar_url} alt="" className="ss-topbar-notification-team" />
        ) : (
          <MemberAvatar src={notification.actor?.avatar_url || notification.data?.avatar_url} name={actorName || 'SlipSurge'} size={38} />
        )}
        <span className="ss-topbar-notification-badge">{badge}</span>
      </div>
      <span className="ss-topbar-notification-copy">
        <span>{message}</span>
        <small>{compactTimeAgo(notification.created_at)}</small>
      </span>
      {unread ? <span className="ss-topbar-notification-unread" aria-label="Unread" /> : null}
    </>
  )

  return (
    <div className="ss-topbar-notification-row" data-unread={unread ? 'true' : 'false'}>
      {notification.link ? (
        <Link href={notification.link} className="ss-topbar-notification-link" onClick={() => onOpen(items)}>
          {content}
        </Link>
      ) : (
        <button type="button" className="ss-topbar-notification-link" onClick={() => onOpen(items)}>{content}</button>
      )}
      <button type="button" className="ss-topbar-notification-dismiss" onClick={() => onDelete(items.map(item => item.id))} aria-label="Dismiss notification">
        <X size={13} />
      </button>
    </div>
  )
}

export function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user, profile } = useAuth()
  const [search, setSearch] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [discordSyncing, setDiscordSyncing] = useState(false)
  const [discordSyncMsg, setDiscordSyncMsg] = useState('')
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifFilter, setNotifFilter] = useState<NotificationFilter>('all')
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifError, setNotifError] = useState('')
  const [unread, setUnread] = useState(0)
  const [notifications, setNotifications] = useState<NotifRow[]>([])
  const customEmojis = useCustomEmojis()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
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
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const focusSearch = () => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
      setQuickOpen(true)
    }
    window.addEventListener('slipsurge:focus-search', focusSearch)
    return () => window.removeEventListener('slipsurge:focus-search', focusSearch)
  }, [])

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
  }, [search, supabase])

  const hasQuickResults = quickResults.users.length > 0 || quickResults.posts.length > 0 || quickResults.players.length > 0 || quickResults.teams.length > 0 || quickResults.nflPlayers.length > 0 || quickResults.nflTeams.length > 0
  const visibleNotifications = useMemo(() => {
    if (notifFilter === 'unread') return notifications.filter(notification => !notification.read)
    if (notifFilter === 'mentions') return notifications.filter(notification => notification.type === 'mention')
    return notifications
  }, [notifFilter, notifications])

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
        (payload: any) => {
          if (blockedIdsRef.current.includes(payload.new?.actor_id)) return
          const incoming = { ...payload.new, actor: null } as NotifRow
          setUnread(count => count + 1)
          setNotifications(current => current.some(item => item.id === incoming.id) ? current : [incoming, ...current].slice(0, 20))
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, supabase])

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
      setNotifLoading(true)
      setNotifError('')
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, message, body, link, read, created_at, data, actor_id, actor:users!notifications_actor_id_fkey(username, display_name, avatar_url)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)
      setNotifLoading(false)
      if (error) {
        setNotifError('Could not refresh activity.')
        return
      }
      const blockedSet = new Set(blockedIdsRef.current)
      setNotifications(((data as any) ?? []).filter((n: NotifRow) => !n.actor_id || !blockedSet.has(n.actor_id)))
    }
  }

  async function markAllNotificationsRead() {
    if (!user || unread === 0) return
    const previous = notifications
    const previousUnread = unread
    setUnread(0)
    setNotifications(current => current.map(notification => ({ ...notification, read: true })))
    const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)
    if (error) {
      setNotifications(previous)
      setUnread(previousUnread)
      setNotifError('Could not mark activity as read.')
    }
  }

  function markNotificationsRead(rows: NotifRow[]) {
    setNotifOpen(false)
    if (!user) return
    const unreadIds = rows.filter(row => !row.read).map(row => row.id)
    if (!unreadIds.length) return
    const idSet = new Set(unreadIds)
    setNotifications(current => current.map(item => idSet.has(item.id) ? { ...item, read: true } : item))
    setUnread(count => Math.max(0, count - unreadIds.length))
    void supabase.from('notifications').update({ read: true }).in('id', unreadIds).eq('user_id', user.id).then(({ error }) => {
      if (!error) return
      setNotifications(current => current.map(item => idSet.has(item.id) ? { ...item, read: false } : item))
      setUnread(count => count + unreadIds.length)
    })
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setQuickOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      setMenuOpen(false)
      setNotifOpen(false)
      setQuickOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
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
    <header className="ss-site-topbar" style={{
      height: 'var(--topbar-h)',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '0 16px',
      // --banner-h is set by SiteBanner (0px when it's not showing) so this
      // sticks right below the banner instead of both pinning to literal
      // y:0 and overlapping once you scroll past the banner.
      position: 'sticky', top: 'var(--banner-h, 0px)', zIndex: 'var(--layer-floating)',
    }}>
      {/* Hamburger — mobile only, opens the off-canvas sidebar drawer.
          display must live in the className (flex / md:hidden), not inline
          style — an inline style="display:flex" would always beat the
          md:hidden class (inline styles win over any stylesheet rule
          regardless of specificity), so the button would never actually
          hide on desktop. */}
      {onMenuClick && (
        <button onClick={onMenuClick} className="flex md:hidden items-center justify-center" style={{
          width: 42, height: 42, borderRadius: 11, flexShrink: 0,
          background: 'transparent', border: '1px solid var(--border)',
          color: 'var(--text-2)', cursor: 'pointer',
        }}
        aria-label="Open menu">
          <Menu size={16} />
        </button>
      )}

      {/* Search */}
      <form ref={searchRef} onSubmit={handleSearch} className="ss-topbar-search">
        <Search size={14} style={{
          position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--text-3)', pointerEvents: 'none',
        }} />
        <input
          ref={searchInputRef}
          value={search}
          onChange={e => { setSearch(e.target.value); setQuickOpen(true) }}
          onFocus={() => setQuickOpen(true)}
          placeholder="Search picks, users, teams…"
          className="ss-topbar-search-input"
          aria-label="Search SlipSurge"
        />

        {search && (
          <button type="button" className="ss-topbar-search-clear" aria-label="Clear search"
            onClick={() => { setSearch(''); setQuickResults(EMPTY_RESULTS); searchInputRef.current?.focus() }}>
            <X size={12} />
          </button>
        )}

        {quickOpen && search.trim().length >= 2 && (
          <div className="ss-dropdown ss-topbar-search-results" role="dialog" aria-label="Search suggestions" style={{
            position: 'absolute', left: 0, right: 0, top: 'calc(100% + 6px)',
            maxHeight: 420, overflowY: 'auto',
          }}>
            <div className="ss-topbar-panel-heading"><Search size={13} /><span>Search results</span></div>
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
                    <SafeImage src={t.team_logo_espn} alt={t.team_abbr} style={{ width: 26, height: 26, objectFit: 'contain', flexShrink: 0 }} fallback={<div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--surface-3)', flexShrink: 0 }} />} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)' }}>{t.team_name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 900, color: 'var(--text-3)' }}>NFL</span>
                  </button>
                ))}
                {quickResults.nflPlayers.map(p => (
                  <button key={`np-${p.gsis_id}`} onClick={() => goTo(`/nfl/players/${p.gsis_id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                    className="notif-dropdown-item">
                    <SafeImage src={p.headshot} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} fallback={<div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--surface-3)', flexShrink: 0 }} />} />
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
                    <MemberAvatar src={u.avatar_url} name={u.display_name || u.username} size={26} />
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
      <div className="ss-topbar-actions">
        {user ? (
          <>
            {/* Notifications */}
            <div ref={notifRef} className="ss-topbar-control-wrap">
              <button onClick={openNotifications} className="ss-topbar-icon-button" aria-label="Notifications" aria-expanded={notifOpen} style={{
                position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 36, height: 36, borderRadius: 8,
                background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--text-2)', cursor: 'pointer', transition: 'all 130ms',
              }}>
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
                <div className="ss-dropdown ss-topbar-notifications" role="dialog" aria-label="Notifications">
                  <div className="ss-topbar-notification-heading">
                    <div>
                      <span className="ss-topbar-panel-icon"><Bell size={15} /></span>
                      <span><strong>Activity</strong><small>{unread ? `${unread} unread` : 'All caught up'}</small></span>
                    </div>
                    <div className="ss-topbar-heading-actions">
                      <button type="button" onClick={markAllNotificationsRead} disabled={!unread} aria-label="Mark all notifications as read" title="Mark all read"><CheckCheck size={15} /></button>
                      <Link href="/settings/notifications" onClick={() => setNotifOpen(false)} aria-label="Notification settings" title="Notification settings"><Settings size={15} /></Link>
                      <button type="button" className="ss-topbar-mobile-close" onClick={() => setNotifOpen(false)} aria-label="Close notifications"><X size={16} /></button>
                    </div>
                  </div>
                  <div className="ss-topbar-notification-tabs" role="tablist" aria-label="Filter notifications">
                    {(['all', 'unread', 'mentions'] as NotificationFilter[]).map(filter => (
                      <button type="button" role="tab" aria-selected={notifFilter === filter} data-active={notifFilter === filter ? 'true' : 'false'} key={filter} onClick={() => setNotifFilter(filter)}>
                        {filter === 'all' ? 'All' : filter === 'unread' ? 'Unread' : 'Mentions'}
                        {filter === 'unread' && unread ? <span>{unread > 99 ? '99+' : unread}</span> : null}
                      </button>
                    ))}
                  </div>
                  <div className="ss-topbar-notification-feed">
                    {notifError ? <button type="button" className="ss-topbar-notification-error" onClick={openNotifications}>{notifError} Try again</button> : null}
                    {notifLoading ? (
                      <div className="ss-topbar-notification-loading" aria-label="Loading notifications">
                        {[0, 1, 2].map(item => <span key={item}><i /><b /><b /></span>)}
                      </div>
                    ) : visibleNotifications.length === 0 ? (
                      <div className="ss-topbar-notification-empty">
                        <span><CheckCheck size={20} /></span>
                        <strong>{notifFilter === 'all' ? "You're all caught up" : `No ${notifFilter} activity`}</strong>
                        <small>New activity will appear here.</small>
                      </div>
                    ) : (
                      collapseConsecutiveFollows(visibleNotifications).map(entry => (
                        <TopbarNotificationEntry
                          key={Array.isArray(entry) ? entry.map(item => item.id).join(':') : entry.id}
                          entry={entry}
                          customEmojis={customEmojis}
                          onOpen={markNotificationsRead}
                          onDelete={deleteNotif}
                        />
                      ))
                    )}
                  </div>
                  <div className="ss-topbar-notification-footer">
                    <Link href="/notifications" onClick={() => setNotifOpen(false)}>See all activity <ChevronRight size={14} /></Link>
                  </div>
                </div>
              )}
            </div>

            {/* Avatar + menu */}
            <div ref={menuRef} className="ss-topbar-control-wrap">
              <button onClick={() => { setMenuOpen(v => !v); setNotifOpen(false) }} className="ss-topbar-profile-trigger" aria-label="Open account menu" aria-expanded={menuOpen} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px 5px 5px', borderRadius: 8,
                background: 'transparent', border: '1px solid var(--border)',
                cursor: 'pointer', transition: 'all 130ms',
              }}>
                <MemberAvatar className="ss-topbar-profile-avatar" src={profile?.avatar_url} name={profile?.display_name || profile?.username || 'Member'} size={26} tone={profile?.tier === 'ultimate' ? 'ultimate' : profile?.tier === 'advanced' ? 'advanced' : profile?.account_type === 'creator' ? 'creator' : 'default'} ringStyle={profile?.avatar_ring_style} ringColor={profile?.avatar_ring_color} />
                <span className="ss-topbar-profile-copy hidden sm:flex">
                  <strong>{profile?.display_name || profile?.username || 'Me'}</strong>
                  <small>{tierLabel}</small>
                </span>
                <ChevronDown size={12} style={{ color: 'var(--text-3)' }} />
              </button>

              {menuOpen && (
                <div className="ss-dropdown ss-topbar-profile-menu" role="menu" aria-label="Account menu">
                  <div className="ss-topbar-account-card">
                    <MemberAvatar src={profile?.avatar_url} name={profile?.display_name || profile?.username || 'Member'} size={46} tone={profile?.tier === 'ultimate' ? 'ultimate' : profile?.tier === 'advanced' ? 'advanced' : profile?.account_type === 'creator' ? 'creator' : 'default'} ringStyle={profile?.avatar_ring_style} ringColor={profile?.avatar_ring_color} />
                    <div className="ss-topbar-account-copy">
                      <strong>{profile?.display_name || profile?.username || 'Member'}</strong>
                      <span>@{profile?.username}</span>
                      <Link href="/settings/membership" onClick={() => setMenuOpen(false)}><Badge variant="save">{tierLabel}</Badge></Link>
                    </div>
                    <Link href={`/profile/${profile?.username}`} className="ss-topbar-account-open" onClick={() => setMenuOpen(false)} aria-label="View your profile"><ChevronRight size={16} /></Link>
                  </div>
                  <p className="ss-topbar-menu-label">Account</p>
                  <Link href={`/profile/${profile?.username}`} className="ss-dropdown-item" onClick={() => setMenuOpen(false)}>
                    <User size={15} /><span>Profile</span><ChevronRight size={13} />
                  </Link>
                  <Link href="/bookmarks" className="ss-dropdown-item" onClick={() => setMenuOpen(false)}>
                    <Bookmark size={15} /><span>Bookmarks</span><ChevronRight size={13} />
                  </Link>
                  <Link href="/settings" className="ss-dropdown-item" onClick={() => setMenuOpen(false)}>
                    <Settings size={15} /><span>Settings</span><ChevronRight size={13} />
                  </Link>
                  <Link href="/settings/membership" className="ss-dropdown-item" onClick={() => setMenuOpen(false)}>
                    <CreditCard size={15} /><span>Membership</span><ChevronRight size={13} />
                  </Link>
                  {(profile?.account_type === 'creator' || profile?.username?.toLowerCase() === 'slipsurge') && (
                    <>
                      <p className="ss-topbar-menu-label">Creator</p>
                      <Link href="/creators/studio" className="ss-dropdown-item" onClick={() => setMenuOpen(false)}>
                        <Sparkles size={15} /><span>Creator Studio</span><ChevronRight size={13} />
                      </Link>
                      <Link href="/creators/payouts" className="ss-dropdown-item" onClick={() => setMenuOpen(false)}>
                        <WalletCards size={15} /><span>Payouts</span><ChevronRight size={13} />
                      </Link>
                    </>
                  )}
                  {profile?.account_type === 'admin' && (
                    <Link href="/admin" className="ss-dropdown-item" onClick={() => setMenuOpen(false)}>
                      <Shield size={15} /><span>Admin</span><ChevronRight size={13} />
                    </Link>
                  )}
                  <p className="ss-topbar-menu-label">Support</p>
                  <Link href="/support" className="ss-dropdown-item" onClick={() => setMenuOpen(false)}>
                    <CircleHelp size={15} /><span>Help & support</span><ChevronRight size={13} />
                  </Link>
                  <button type="button" className="ss-dropdown-item" onClick={claimDiscordRole} disabled={discordSyncing}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.955 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                    </svg>
                    <span>{discordSyncMsg || (discordSyncing ? 'Syncing…' : 'Sync Discord access')}</span>
                  </button>
                  <div className="ss-topbar-menu-separator" />
                  <button type="button" className="ss-dropdown-item danger" onClick={signOut}>
                    <LogOut size={15} /><span>Sign out</span>
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
