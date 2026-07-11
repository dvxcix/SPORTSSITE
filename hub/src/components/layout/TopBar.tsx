'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, Bell, ChevronDown, LogOut, User, Settings, Shield } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'

export function TopBar() {
  const { user, profile } = useAuth()
  const [search, setSearch] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const router = useRouter()
  const supabase = createClient()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!user) return
    supabase.from('notifications').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('read', false)
      .then(({ count }) => setUnread(count ?? 0))
  }, [user])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (search.trim()) router.push(`/search?q=${encodeURIComponent(search.trim())}`)
  }

  return (
    <header style={{
      height: 'var(--topbar-h)',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '0 16px',
      position: 'sticky', top: 0, zIndex: 20,
    }}>
      {/* Search */}
      <form onSubmit={handleSearch} style={{ flex: 1, maxWidth: 400, position: 'relative' }}>
        <Search size={14} style={{
          position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--text-3)', pointerEvents: 'none',
        }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search picks, users, teams…"
          style={{
            width: '100%', paddingLeft: 32, paddingRight: 12,
            paddingTop: 7, paddingBottom: 7,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 999, fontSize: 13, color: 'var(--text-1)',
            outline: 'none', transition: 'border-color 150ms',
          }}
          onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
          onBlur={e => (e.target.style.borderColor = 'var(--border)')}
        />
      </form>

      {/* Right controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
        {user ? (
          <>
            {/* Notifications */}
            <Link href="/notifications" style={{
              position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, borderRadius: 8,
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-2)', textDecoration: 'none', transition: 'all 130ms',
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
            </Link>

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
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
