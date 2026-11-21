'use client'

import { AccountMenu } from './AccountMenu'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { useState, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, Bell, ChevronRight, Settings, Heart, MessageCircle, UserPlus, AtSign, Trophy, Zap, Repeat2, Users, Menu, TrendingUp, X, CheckCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'
import { PlayerAvatar, TeamLogo } from '@/components/sports/PlayerAvatar'
import { NflTeamLogo } from '@/components/shared/NflTeamLogo'
import { mlbHeadshot, mlbTeamLogo } from '@slipsurge/core/mlb-api'
import { useCustomEmojis, type CustomEmoji } from '@/lib/emoji'
import { collapseConsecutiveFollows } from '@/components/social/NotificationsList'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { getBlockedEitherWayIds } from '@/lib/blocks'
import { SafeImage } from '@/components/ui/SafeImage'
import { FloatingSurface } from '@/components/ui/FloatingSurface'
import { EmojiText } from '@/components/social/EmojiText'
import { hasNbaAccess } from '@/lib/nbaAccessPolicy'
import type { NbaSearchPlayer, NbaSearchTeam } from '@/lib/nbaEntities'


const NOTIF_ICONS: Record<string, any> = {
  reaction: Heart, comment: MessageCircle, follow: UserPlus,
  mention: AtSign, pick_result: Trophy, message: MessageCircle, subscription: Zap, repost: Repeat2,
  group_invite: Users, new_pick: TrendingUp,
}

type NotifRow = {
  id: string; type: string; message: string | null; body: string | null
  link: string | null; read: boolean; created_at: string; actor_id?: string | null
  actor?: { avatar_ring_style?: import('@/lib/avatarStyles').MemberRingStyle | null; avatar_ring_color?: string | null; username: string; display_name?: string; avatar_url?: string } | null
  data?: { avatar_url?: string; emoji?: string; team_logo?: string } | null
}

type NotificationFilter = 'all' | 'unread' | 'mentions'

type QuickResults = {
  users: any[]; posts: any[]
  players: { mlbId: number; name: string; position: string | null; teamId: number | null; teamName: string | null }[]
  teams: { id: number; abbr: string; name: string; gamePk: number | null }[]
  nflPlayers: { gsis_id: string; display_name: string; position: string | null; latest_team: string | null; headshot: string | null; team_logo_espn: string | null }[]
  nflTeams: { team_abbr: string; team_name: string; team_logo_espn: string | null }[]
  nbaPlayers: NbaSearchPlayer[]
  nbaTeams: NbaSearchTeam[]
}
const EMPTY_RESULTS: QuickResults = { users: [], posts: [], players: [], teams: [], nflPlayers: [], nflTeams: [], nbaPlayers: [], nbaTeams: [] }

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
          <MemberAvatar src={notification.actor?.avatar_url || notification.data?.avatar_url} ringStyle={notification.actor?.avatar_ring_style} ringColor={notification.actor?.avatar_ring_color} name={actorName || 'SlipSurge'} size={38} />
        )}
        <span className="ss-topbar-notification-badge">{badge}</span>
      </div>
      <span className="ss-topbar-notification-copy">
        <span><EmojiText text={message} /></span>
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
  const { user, profile, loading, authUnavailable, retrySession } = useAuth()
  const nbaAccess = hasNbaAccess(profile)
  const mlbAccess = !MLB_HIBERNATING || profile?.account_type === 'admin'
  const [search, setSearch] = useState('')
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifFilter, setNotifFilter] = useState<NotificationFilter>('all')
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifError, setNotifError] = useState('')
  const [unread, setUnread] = useState(0)
  const [notifications, setNotifications] = useState<NotifRow[]>([])
  const userId = user?.id
  const notificationEpoch = useRef(0)
  const [notificationOwner, setNotificationOwner] = useState(userId)
  if (notificationOwner !== userId) {
    setNotificationOwner(userId)
    setNotifications([]); setUnread(0); setNotifOpen(false); setNotifLoading(false); setNotifError('')
  }
  const customEmojis = useCustomEmojis()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const notifTriggerRef = useRef<HTMLButtonElement>(null)
  const [blockState, setBlockState] = useState<{ owner: string | undefined; ids: string[] | null }>({ owner: undefined, ids: null })
  const accountContext = `${userId ?? ''}:${loading}:${authUnavailable}`
  const [observedAccountContext, setObservedAccountContext] = useState(accountContext)
  const [accountGeneration, setAccountGeneration] = useState(0)
  if (observedAccountContext !== accountContext) {
    setObservedAccountContext(accountContext); setAccountGeneration(value => value + 1)
    setBlockState({ owner: userId, ids: null })
  }
  const currentBlockIds = blockState.owner === userId && !loading && !authUnavailable ? blockState.ids : null
  const visibleUnread = notificationOwner === userId && currentBlockIds !== null ? unread : 0

  // Live type-ahead preview — same data sources /search itself uses
  // (users/posts by ilike, MLB players/teams via the shared route), just
  // capped smaller since this is a glance-and-click dropdown, not the full
  // results page. Typing used to just sit there doing nothing until you
  // hit Enter and got dumped on /search with an EMPTY box, forcing a
  // retype of what you'd already typed.
  const [quickResults, setQuickResults] = useState<QuickResults>(EMPTY_RESULTS)
  const [quickResultsOwner, setQuickResultsOwner] = useState(userId)
  const [quickResultsGeneration, setQuickResultsGeneration] = useState(0)
  const [quickOpen, setQuickOpen] = useState(false)
  useEffect(() => {
    const closeQuick = () => setQuickOpen(false)
    const commandShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') closeQuick()
    }
    window.addEventListener('slipsurge:open-command', closeQuick)
    window.addEventListener('keydown', commandShortcut)
    return () => {
      window.removeEventListener('slipsurge:open-command', closeQuick)
      window.removeEventListener('keydown', commandShortcut)
    }
  }, [])
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
    const controller = new AbortController()
    setQuickResults(EMPTY_RESULTS)
    setQuickLoading(true)
    const t = setTimeout(async () => {
      try {
        const socialReady = currentBlockIds !== null
        const postCols = 'id, content, pick_data, sport, author_id, author:users!posts_author_id_fkey(username, display_name)'
        const [{ data: u }, { data: byContent }, { data: recentPicks }, sportsData, nflData, nbaData] = await Promise.all([
          socialReady ? supabase.from('users')
            .select('id, username, display_name, avatar_url, avatar_ring_style, avatar_ring_color')
            .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
            .limit(3).abortSignal(controller.signal) : Promise.resolve({ data: [] }),
          socialReady ? supabase.from('posts').select(postCols)
            .ilike('content', `%${query}%`)
            .eq('visibility', 'public')
            .order('created_at', { ascending: false })
            .limit(3).abortSignal(controller.signal) : Promise.resolve({ data: [] }),
          // Same content-then-pick_data merge as the full /search results page
          // (SearchClient.tsx) — a pick's player name usually only lives in
          // pick_data, not the caption, so content-only search missed it here
          // too. Can't do this as a single .or() query — PostgREST's logic
          // tree grammar rejects a `column::type` cast (confirmed live via a
          // PGRST100 parse error), so it's a separate bounded fetch merged
          // client-side instead.
          socialReady ? supabase.from('posts').select(postCols)
            .in('post_type', ['pick', 'parlay'])
            .eq('visibility', 'public')
            .order('created_at', { ascending: false })
            .limit(150).abortSignal(controller.signal) : Promise.resolve({ data: [] }),
          mlbAccess ? fetch(`/api/search/sports?q=${encodeURIComponent(query)}`, { signal: controller.signal }).then(r => r.ok ? r.json() : { players: [], teams: [] }).catch(() => ({ players: [], teams: [] })) : Promise.resolve({ players: [], teams: [] }),
          fetch(`/api/search/nfl?q=${encodeURIComponent(query)}`, { signal: controller.signal }).then(r => r.ok ? r.json() : { players: [], teams: [] }).catch(() => ({ players: [], teams: [] })),
          nbaAccess ? fetch(`/api/search/nba?q=${encodeURIComponent(query)}`, { cache: 'no-store', signal: controller.signal }).then(r => r.ok ? r.json() : { players: [], teams: [] }).catch(() => ({ players: [], teams: [] })) : Promise.resolve({ players: [], teams: [] }),
        ])
        if (controller.signal.aborted) return
        const q = query.toLowerCase()
        const byPickData = (recentPicks ?? []).filter((post: any) => JSON.stringify(post.pick_data ?? {}).toLowerCase().includes(q))
        const seen = new Set<string>()
        const blockedSet = new Set(currentBlockIds ?? [])
        const p = [...(byContent ?? []), ...byPickData]
          .filter(post => (seen.has(post.id) ? false : (seen.add(post.id), true)))
          .filter((post: any) => !blockedSet.has(post.author_id))
          .filter(post => mlbAccess || post.sport?.toUpperCase() !== 'MLB')
          .slice(0, 3)
        setQuickResultsOwner(userId)
        setQuickResultsGeneration(accountGeneration)
        setQuickResults({
          users: socialReady ? (u ?? []).filter((r: any) => !blockedSet.has(r.id)) : [], posts: socialReady ? p : [],
          players: (sportsData.players ?? []).slice(0, 3),
          teams: (sportsData.teams ?? []).slice(0, 2),
          nflPlayers: (nflData.players ?? []).slice(0, 3),
          nflTeams: (nflData.teams ?? []).slice(0, 2),
          nbaPlayers: (nbaData.players ?? []).slice(0, 3),
          nbaTeams: (nbaData.teams ?? []).slice(0, 2),
        })
      } catch {
        if (!controller.signal.aborted) setQuickResults(EMPTY_RESULTS)
      } finally {
        if (!controller.signal.aborted) setQuickLoading(false)
      }
    }, 250)
    return () => { controller.abort(); clearTimeout(t) }
  }, [search, supabase, nbaAccess, mlbAccess, userId, currentBlockIds, accountGeneration])

  const showSocialQuick = quickResultsOwner === userId && quickResultsGeneration === accountGeneration && currentBlockIds !== null
  const activeBlocked = new Set(currentBlockIds ?? [])
  const visibleQuickUsers = showSocialQuick ? quickResults.users.filter(item => !activeBlocked.has(item.id)) : []
  const visibleQuickPosts = showSocialQuick ? quickResults.posts.filter(item => !activeBlocked.has(item.author_id) && (mlbAccess || item.sport?.toUpperCase() !== 'MLB')) : []
  const hasQuickResults = visibleQuickUsers.length > 0 || visibleQuickPosts.length > 0 || mlbAccess && (quickResults.players.length > 0 || quickResults.teams.length > 0) || quickResults.nflPlayers.length > 0 || quickResults.nflTeams.length > 0 || nbaAccess && (quickResults.nbaPlayers.length > 0 || quickResults.nbaTeams.length > 0)
  const visibleNotifications = useMemo(() => {
    if (notificationOwner !== userId || currentBlockIds === null) return []
    const filtered = notifications.filter(notification => !notification.actor_id || !currentBlockIds.includes(notification.actor_id))
    if (notifFilter === 'unread') return filtered.filter(notification => !notification.read)
    if (notifFilter === 'mentions') return filtered.filter(notification => notification.type === 'mention')
    return filtered
  }, [notifFilter, notifications, notificationOwner, userId, currentBlockIds])


  function goTo(href: string) {
    setQuickOpen(false)
    router.push(href)
  }

  useEffect(() => {
    let cancelled = false
    if (!userId) {
      if (!loading && !authUnavailable) queueMicrotask(() => { if (!cancelled) setBlockState({ owner: undefined, ids: [] }) })
      return () => { cancelled = true }
    }
    getBlockedEitherWayIds(supabase, userId).then(ids => {
      if (cancelled) return
      setBlockState({ owner: userId, ids })
      setNotifications(current => current.filter(item => !item.actor_id || !ids.includes(item.actor_id)))
      let countQuery = supabase.from('notifications').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('read', false)
      if (ids.length) countQuery = countQuery.not('actor_id', 'in', `(${ids.join(',')})`)
      return countQuery.then(({ count }) => { if (!cancelled) setUnread(count ?? 0) })
    }).catch(() => { if (!cancelled) setBlockState({ owner: userId, ids: null }) })
    return () => { cancelled = true }
  }, [userId, supabase, loading, authUnavailable])

  useEffect(() => {
    const epoch = ++notificationEpoch.current
    if (!userId || currentBlockIds === null) return () => { notificationEpoch.current = epoch + 1 }
    let cancelled = false
    // Live badge — bump the count the instant a new notification lands,
    // without the user needing to reload anything. A blocked actor's
    // notification will still insert (blocking doesn't stop the underlying
    // action, e.g. a like), so it's filtered against the same ref here too.
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload: any) => {
          if (cancelled) return
          if (currentBlockIds.includes(payload.new?.actor_id)) return
          const incoming = { ...payload.new, actor: null } as NotifRow
          setUnread(count => count + 1)
          setNotifications(current => current.some(item => item.id === incoming.id) ? current : [incoming, ...current].slice(0, 20))
        })
      .subscribe()
    return () => { cancelled = true; notificationEpoch.current = epoch + 1; supabase.removeChannel(channel) }
  }, [userId, supabase, currentBlockIds])

  async function openNotifications() {
    const epoch = notificationEpoch.current
    const opening = !notifOpen
    setNotifOpen(opening)

    // Previously only fetched once ever (gated behind a one-time-set flag)
    // — the realtime subscription above bumps the unread badge on a new
    // notification, but the dropdown's actual list never refreshed after
    // that first load, so a genuinely new notification could be sitting
    // in the DB while the open dropdown kept showing stale contents.
    // Cheap enough (10 rows) to just refetch on every open.
    if (opening && user) {
      if (currentBlockIds === null) { setNotifError('Could not refresh activity.'); return }
      setNotifLoading(true)
      setNotifError('')
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, message, body, link, read, created_at, data, actor_id, actor:users!notifications_actor_id_fkey(username, display_name, avatar_url,avatar_ring_style,avatar_ring_color)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)
      if (notificationEpoch.current !== epoch) return
      setNotifLoading(false)
      if (error) {
        setNotifError('Could not refresh activity.')
        return
      }
      const blockedSet = new Set(currentBlockIds)
      setNotifications(((data as any) ?? []).filter((n: NotifRow) => !n.actor_id || !blockedSet.has(n.actor_id)))
    }
  }

  async function markAllNotificationsRead() {
    if (!user || unread === 0) return
    const epoch = notificationEpoch.current
    const previous = notifications
    const previousUnread = unread
    setUnread(0)
    setNotifications(current => current.map(notification => ({ ...notification, read: true })))
    const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)
    if (notificationEpoch.current !== epoch) return
    if (error) {
      setNotifications(previous)
      setUnread(previousUnread)
      setNotifError('Could not mark activity as read.')
    }
  }

  function markNotificationsRead(rows: NotifRow[]) {
    setNotifOpen(false)
    if (!user) return
    const epoch = notificationEpoch.current
    const unreadIds = rows.filter(row => !row.read).map(row => row.id)
    if (!unreadIds.length) return
    const idSet = new Set(unreadIds)
    setNotifications(current => current.map(item => idSet.has(item.id) ? { ...item, read: true } : item))
    setUnread(count => Math.max(0, count - unreadIds.length))
    void supabase.from('notifications').update({ read: true }).in('id', unreadIds).eq('user_id', user.id).then(({ error }) => {
      if (notificationEpoch.current !== epoch) return
      if (!error) return
      setNotifications(current => current.map(item => idSet.has(item.id) ? { ...item, read: false } : item))
      setUnread(count => count + unreadIds.length)
    })
  }

  async function deleteNotif(ids: string | string[]) {
    if (!user) return
    const epoch = notificationEpoch.current
    const idList = Array.isArray(ids) ? ids : [ids]
    const prev = notifications
    setNotifications(p => p.filter(n => !idList.includes(n.id)))
    const { error } = await supabase.from('notifications').delete().in('id', idList).eq('user_id', user.id)
    if (notificationEpoch.current !== epoch) return
    if (error) setNotifications(prev) // restore — it's still in the DB
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
        <button type="button" onClick={onMenuClick} className="flex md:hidden items-center justify-center" style={{
          width: 42, height: 42, borderRadius: 11, flexShrink: 0,
          background: 'transparent', border: '1px solid var(--border)',
          color: 'var(--text-2)', cursor: 'pointer',
        }}
        aria-label="Open menu">
          <Menu size={16} />
        </button>
      )}

      {!user && <div className="ss-topbar-theme"><ThemeToggle /></div>}
      {/* Search */}
      <form ref={searchRef} onSubmit={handleSearch} className="ss-topbar-search">
        <Search size={14} style={{
          position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--text-3)', pointerEvents: 'none',
        }} />
        <input
          ref={searchInputRef}
          value={search}
          maxLength={64}
          onChange={e => { setSearch(e.target.value); setQuickOpen(true) }}
          onFocus={() => setQuickOpen(true)}
          placeholder="Search SlipSurge"
          className="ss-topbar-search-input"
          aria-label="Search SlipSurge"
        />

        {search && (
          <button type="button" className="ss-topbar-search-clear" aria-label="Clear search"
            onClick={() => { setSearch(''); setQuickResults(EMPTY_RESULTS); searchInputRef.current?.focus() }}>
            <X size={12} />
          </button>
        )}

        <FloatingSurface
          open={quickOpen && search.trim().length >= 2}
          anchorRef={searchRef}
          onClose={() => setQuickOpen(false)}
          className="ss-dropdown ss-topbar-search-results"
          width={500}
          gap={6}
          align="start"
          role="dialog"
          ariaLabel="Search suggestions"
        >
            <div className="ss-topbar-panel-heading"><Search size={13} /><span>Search results</span></div>
            {quickLoading && !hasQuickResults ? (
              <div style={{ padding: '16px 14px', textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>Searching…</div>
            ) : !hasQuickResults ? (
              <div style={{ padding: '16px 14px', textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>No results for "{search.trim()}"</div>
            ) : (
              <>
                {mlbAccess && quickResults.teams.map(t => (
                  <button type="button" key={`t-${t.abbr}`} onClick={() => goTo(t.gamePk ? `/sports/mlb/${t.gamePk}` : '/sports')}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                    className="notif-dropdown-item">
                    <TeamLogo logo={mlbTeamLogo(t.id)} name={t.abbr} size={26} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)' }}>{t.name}</span>
                    {t.gamePk && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--red)' }}>LIVE</span>}
                  </button>
                ))}
                {mlbAccess && quickResults.players.map(p => (
                  <button type="button" key={`p-${p.mlbId}`} onClick={() => goTo(`/players/${p.mlbId}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                    className="notif-dropdown-item">
                    <PlayerAvatar headshot={mlbHeadshot(p.mlbId)} teamLogo={p.teamId ? mlbTeamLogo(p.teamId) : null} name={p.name} size={26} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{[p.position, p.teamName].filter(Boolean).join(' · ')}</div>
                    </div>
                  </button>
                ))}
                {quickResults.nflTeams.map(t => (
                  <button type="button" key={`nt-${t.team_abbr}`} onClick={() => goTo(`/nfl/teams/${t.team_abbr}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                    className="notif-dropdown-item">
                    <SafeImage src={t.team_logo_espn} alt={t.team_abbr} style={{ width: 26, height: 26, objectFit: 'contain', flexShrink: 0 }} fallback={<div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--surface-3)', flexShrink: 0 }} />} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)' }}>{t.team_name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--text-3)' }}>NFL</span>
                  </button>
                ))}
                {quickResults.nflPlayers.map(p => (
                  <button type="button" key={`np-${p.gsis_id}`} onClick={() => goTo(`/nfl/players/${p.gsis_id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                    className="notif-dropdown-item">
                    <SafeImage src={p.headshot} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} fallback={<div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--surface-3)', flexShrink: 0 }} />} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.display_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span>{p.position}</span>
                        {p.position && p.latest_team && <span>·</span>}
                        {p.latest_team && <NflTeamLogo abbr={p.latest_team} logoUrl={p.team_logo_espn} size={12} />}
                      </div>
                    </div>
                  </button>
                ))}
                {nbaAccess && quickResults.nbaTeams.map(team => (
                  <button type="button" key={`nba-team-${team.id}`} onClick={() => goTo(`/nba/teams/${team.id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }} className="notif-dropdown-item">
                    <TeamLogo logo={team.logo} name={team.name} size={28}/>
                    <span style={{ minWidth: 0, flex: 1, fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)' }}>{team.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)' }}>NBA</span>
                  </button>
                ))}
                {nbaAccess && quickResults.nbaPlayers.map(player => (
                  <button type="button" key={`nba-player-${player.id}`} onClick={() => goTo(`/nba/players/${player.id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 48, padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }} className="notif-dropdown-item">
                    <PlayerAvatar playerId={player.id} sport="nba" teamAbbr={player.teamAbbr} headshot={player.headshot} teamLogo={player.teamLogo} name={player.name} size={30}/>
                    <span style={{ minWidth: 0, flex: 1 }}><span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{player.name}</span><span style={{ fontSize: 12, color: 'var(--text-3)' }}>{[player.position, player.teamName].filter(Boolean).join(' · ')}</span></span>
                  </button>
                ))}
                {visibleQuickUsers.map(u => (
                  <button type="button" key={`u-${u.id}`} onClick={() => goTo(`/profile/${u.username}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                    className="notif-dropdown-item">
                    <MemberAvatar src={u.avatar_url} ringStyle={u.avatar_ring_style} ringColor={u.avatar_ring_color} name={u.display_name || u.username} size={26} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)' }}>{u.display_name || u.username}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>@{u.username}</span>
                  </button>
                ))}
                {visibleQuickPosts.map(p => (
                  <button type="button" key={`post-${p.id}`} onClick={() => goTo(`/posts/${p.id}`)}
                    style={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%', padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                    className="notif-dropdown-item">
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)' }}>@{p.author?.username}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><EmojiText text={p.content || ''} /></span>
                  </button>
                ))}
                <button type="button" onClick={() => goTo(`/search?q=${encodeURIComponent(search.trim())}`)} style={{
                  display: 'block', width: '100%', textAlign: 'center', padding: '10px', fontSize: 12, fontWeight: 700,
                  color: 'var(--accent)', background: 'transparent', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer',
                }}>
                  See all results for "{search.trim()}"
                </button>
              </>
            )}
        </FloatingSurface>
      </form>

      {/* Right controls */}
      <div className="ss-topbar-actions">
        {user ? (
          <>
            {/* Notifications */}
            <div className="ss-topbar-control-wrap">
              <button ref={notifTriggerRef} type="button" onClick={openNotifications} className="ss-topbar-icon-button" aria-label="Notifications" aria-haspopup="dialog" aria-controls="topbar-notification-center" aria-expanded={notifOpen} style={{
                position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 36, height: 36, borderRadius: 8,
                background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--text-2)', cursor: 'pointer', transition: 'all 130ms',
              }}>
                <Bell size={15} />
                {visibleUnread > 0 && (
                  <span style={{
                    position: 'absolute', top: -4, right: -4,
                    background: 'var(--red-fill)', color: 'var(--on-status)',
                    fontSize: 11, fontWeight: 700, borderRadius: 99,
                    padding: '1px 4px', minWidth: 16, textAlign: 'center',
                    border: '2px solid var(--surface)',
                  }}>
                    {visibleUnread > 9 ? '9+' : visibleUnread}
                  </span>
                )}
              </button>

              <FloatingSurface
                open={notifOpen}
                anchorRef={notifTriggerRef}
                onClose={() => setNotifOpen(false)}
                className="ss-dropdown ss-topbar-notifications"
                width={390}
                align="end"
                mobileSheet
                role="dialog"
                ariaLabel="Notifications"
              >
                <div id="topbar-notification-center" className="ss-topbar-notification-shell">
                  <div className="ss-topbar-notification-heading">
                    <div>
                      <span className="ss-topbar-panel-icon"><Bell size={15} /></span>
                      <span><strong>Activity</strong><small>{visibleUnread ? `${visibleUnread} unread` : 'All caught up'}</small></span>
                    </div>
                    <div className="ss-topbar-heading-actions">
                      <button type="button" onClick={markAllNotificationsRead} disabled={!visibleUnread} aria-label="Mark all notifications as read" title="Mark all read"><CheckCheck size={15} /></button>
                      <Link href="/settings/notifications" onClick={() => setNotifOpen(false)} aria-label="Notification settings" title="Notification settings"><Settings size={15} /></Link>
                      <button type="button" className="ss-topbar-mobile-close" onClick={() => setNotifOpen(false)} aria-label="Close notifications"><X size={16} /></button>
                    </div>
                  </div>
                  <div className="ss-topbar-notification-tabs" role="tablist" aria-label="Filter notifications">
                    {(['all', 'unread', 'mentions'] as NotificationFilter[]).map(filter => (
                      <button type="button" role="tab" aria-selected={notifFilter === filter} data-active={notifFilter === filter ? 'true' : 'false'} key={filter} onClick={() => setNotifFilter(filter)}>
                        {filter === 'all' ? 'All' : filter === 'unread' ? 'Unread' : 'Mentions'}
                        {filter === 'unread' && visibleUnread ? <span>{visibleUnread > 99 ? '99+' : visibleUnread}</span> : null}
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
              </FloatingSurface>
            </div>

            <div className="ss-mobile-account"><AccountMenu /></div>
          </>
        ) : loading || authUnavailable ? (
          <div role="status" className="ss-topbar-guest-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
            <span>{loading ? 'Checking account…' : 'Account connection unavailable'}</span>
            {!loading && <button type="button" onClick={() => void retrySession()} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text-1)' }}>Retry</button>}
          </div>
        ) : (
          <div className="ss-topbar-guest-actions" style={{ display: 'flex', gap: 8 }}>
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
              fontSize: 12, fontWeight: 700, color: 'var(--accent-fg)',
              background: 'var(--accent-fill)', textDecoration: 'none',
              transition: 'background 130ms',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#C8FF6A')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'var(--accent-fill)')}>
              Sign up free
            </Link>
          </div>
        )}
      </div>
    </header>
  )
}
