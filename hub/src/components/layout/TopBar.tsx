'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, Bell, ChevronDown, LogOut, User, Settings, Shield, Heart, MessageCircle, UserPlus, AtSign, Trophy, Zap, Repeat2, Users, Menu, TrendingUp, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { PlayerAvatar, TeamLogo } from '@/components/sports/PlayerAvatar'
import { mlbHeadshot, mlbTeamLogo } from '@/lib/mlb-api'
import { useCustomEmojis } from '@/lib/emoji'

const NOTIF_ICONS: Record<string, any> = {
  reaction: Heart, comment: MessageCircle, follow: UserPlus,
  mention: AtSign, pick_result: Trophy, message: MessageCircle, subscription: Zap, repost: Repeat2,
  group_invite: Users, new_pick: TrendingUp,
}

type NotifRow = {
  id: string; type: string; message: string | null; body: string | null
  link: string | null; read: boolean; created_at: string
  actor?: { username: string; display_name?: string; avatar_url?: string } | null
  data?: { avatar_url?: string; emoji?: string; team_logo?: string } | null
}

type QuickResults = {
  users: any[]; posts: any[]
  players: { mlbId: number; name: string; position: string | null; teamId: number | null; teamName: string | null }[]
  teams: { id: number; abbr: string; name: string; gamePk: number | null }[]
}
const EMPTY_RESULTS: QuickResults = { users: [], posts: [], players: [], teams: [] }

export function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user, profile } = useAuth()
  const [search, setSearch] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [notifications, setNotifications] = useState<NotifRow[]>([])
  const customEmojis = useCustomEmojis()
  const router = useRouter()
  const supabase = createClient()
  const menuRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)

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
      const postCols = 'id, content, pick_data, author:users(username, display_name)'
      const [{ data: u }, { data: byContent }, { data: recentPicks }, sportsData] = await Promise.all([
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
      ])
      if (cancelled) return
      const q = query.toLowerCase()
      const byPickData = (recentPicks ?? []).filter((post: any) => JSON.stringify(post.pick_data ?? {}).toLowerCase().includes(q))
      const seen = new Set<string>()
      const p = [...(byContent ?? []), ...byPickData]
        .filter(post => (seen.has(post.id) ? false : (seen.add(post.id), true)))
        .slice(0, 3)
      setQuickResults({
        users: u ?? [], posts: p,
        players: (sportsData.players ?? []).slice(0, 3),
        teams: (sportsData.teams ?? []).slice(0, 2),
      })
      setQuickLoading(false)
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasQuickResults = quickResults.users.length > 0 || quickResults.posts.length > 0 || quickResults.players.length > 0 || quickResults.teams.length > 0

  function goTo(href: string) {
    setQuickOpen(false)
    router.push(href)
  }

  useEffect(() => {
    if (!user) return
    supabase.from('notifications').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('read', false)
      .then(({ count }) => setUnread(count ?? 0))

    // Live badge — bump the count the instant a new notification lands,
    // without the user needing to reload anything.
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => setUnread(c => c + 1))
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
        .select('id, type, message, body, link, read, created_at, data, actor:users!notifications_actor_id_fkey(username, display_name, avatar_url)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10)
      setNotifications((data as any) ?? [])
    }
    if (opening && unread > 0 && user) {
      setUnread(0)
      await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)
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

  async function deleteNotif(id: string) {
    setNotifications(prev => prev.filter(n => n.id !== id))
    await supabase.from('notifications').delete().eq('id', id).eq('user_id', user!.id)
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
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
                  <button key={`p-${p.mlbId}`} onClick={() => goTo(`/dugout?highlight=${p.mlbId}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                    className="notif-dropdown-item">
                    <PlayerAvatar headshot={mlbHeadshot(p.mlbId)} teamLogo={p.teamId ? mlbTeamLogo(p.teamId) : null} name={p.name} size={26} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{[p.position, p.teamName].filter(Boolean).join(' · ')}</div>
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
                    notifications.map(n => {
                      const Icon = NOTIF_ICONS[n.type] ?? Bell
                      const actorName = n.actor?.display_name || n.actor?.username
                      const text = (actorName ? `${actorName} ` : '') + (n.message || n.body || 'interacted with you')
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
                                <img src={n.actor?.avatar_url || n.data?.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                            onClick={e => { e.preventDefault(); e.stopPropagation(); deleteNotif(n.id) }}
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
