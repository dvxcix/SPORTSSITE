'use client'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AtSign, Bookmark, ChevronDown, ChevronRight, CircleHelp, CreditCard, LogOut, Settings, Shield, Sparkles, User, WalletCards } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { effectiveTier, hasFullAccessOverride, type Tier } from '@slipsurge/core/tiers'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { FloatingSurface } from '@/components/ui/FloatingSurface'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
const subscribeToClient = () => () => {}
const TIER_LABEL: Record<Tier, string> = { free: 'Free', basic: 'Basic', advanced: 'Advanced', ultimate: 'Ultimate' }
/** One account menu shared by the sidebar and compact mobile header. */
export function AccountMenu({ placement = 'topbar', compact = false, onNavigate }: { placement?: 'topbar' | 'sidebar'; compact?: boolean; onNavigate?: () => void }) {
  const { user, profile, loading, signOut: signOutSession } = useAuth()
  const router = useRouter()
  const hydrated = useSyncExternalStore(subscribeToClient, () => true, () => false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const menuId = placement === 'sidebar' ? 'sidebar-account-menu' : 'topbar-account-menu'
  const [owner, setOwner] = useState(user?.id)
  if (owner !== user?.id) { setOwner(user?.id); setMenuOpen(false); setSignOutError('') }
  // Same effectiveTier() fold used everywhere else tier is checked or shown
  // (TierGate, requireTier, /pricing, /settings/membership) — the profile
  // dropdown is one more place someone can glance at their real access
  // level, so it can't show a different answer than any of those.
  const rawTier = (profile?.tier as Tier) ?? 'free'
  const currentTier = effectiveTier(rawTier, profile?.discord_advanced_claimed, profile?.admin_granted_tier as Tier | null | undefined)
  const fullAccess = hasFullAccessOverride(profile?.account_type, profile?.beta_access_active)
  const accountName = profile?.display_name || profile?.username || (loading ? 'Loading account…' : 'Account unavailable')
  const tierLabel = !profile
    ? (loading ? 'Checking access…' : 'Refresh account')
    : fullAccess
      ? (profile.account_type === 'admin' ? 'Admin' : 'Beta — Full Access')
      : TIER_LABEL[currentTier]
  const profileHref = profile?.username ? `/profile/${profile.username}` : '/settings'
  const avatarTone = profile?.account_type === 'admin' || currentTier === 'ultimate'
    ? 'ultimate'
    : currentTier === 'advanced'
      ? 'advanced'
      : profile?.account_type === 'creator'
        ? 'creator'
        : 'default'

  const navigate = () => { setMenuOpen(false); onNavigate?.() }
  const closeMenu = () => { setMenuOpen(false); menuTriggerRef.current?.focus({ preventScroll: true }) }
  useEffect(() => {
    if (!menuOpen) return
    const frame = window.requestAnimationFrame(() => document.getElementById(menuId)?.querySelector<HTMLElement>('a[href],button:not([disabled])')?.focus({ preventScroll: true }))
    return () => window.cancelAnimationFrame(frame)
  }, [menuId, menuOpen])
  function handleMenuKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(); return }
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')).filter(item => item.getClientRects().length)
    const index = items.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
      items[next]?.focus({ preventScroll: true })
    }
    if (event.key === 'Tab' && items.length) {
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus({ preventScroll: true }) }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus({ preventScroll: true }) }
    }
  }
  async function signOut() {
    setSignOutError('')
    try {
      await signOutSession()
      router.push('/auth/login')
    } catch { setSignOutError('Sign out could not finish. Try again.') }
  }

  if (!user || !hydrated) return null
  return (<div className={`ss-account-control ${placement === 'sidebar' ? 'is-sidebar' : 'is-topbar'}`} data-compact={compact}>
              <button ref={menuTriggerRef} type="button" onClick={() => { setMenuOpen(v => !v) }} className="ss-topbar-profile-trigger ss-account-trigger" aria-label="Open account menu" aria-haspopup="menu" aria-controls={menuId} aria-expanded={menuOpen} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px 5px 5px', borderRadius: 8,
                background: 'transparent', border: '1px solid var(--border)',
                cursor: 'pointer', transition: 'all 130ms',
              }}>
                <MemberAvatar className="ss-topbar-profile-avatar" src={profile?.avatar_url} name={accountName} size={26} tone={avatarTone} ringStyle={profile?.avatar_ring_style} ringColor={profile?.avatar_ring_color} />
                {!compact && <span className="ss-topbar-profile-copy"><strong>{accountName}</strong></span>}
                {!compact && <ChevronDown size={14} className="ss-account-chevron" aria-hidden="true" />}
              </button>

              <FloatingSurface
                open={menuOpen}
                anchorRef={menuTriggerRef}
                onClose={() => setMenuOpen(false)}
                className="ss-dropdown ss-topbar-profile-menu"
                width={292}
                align={placement === 'sidebar' ? 'start' : 'end'}
                mobileSheet
                role="menu"
                ariaLabel="Account menu"
              >
                <div id={menuId} className="ss-topbar-profile-menu-shell" onKeyDown={handleMenuKey}>
                  <div className="ss-topbar-account-card">
                    <MemberAvatar src={profile?.avatar_url} name={accountName} size={46} tone={avatarTone} ringStyle={profile?.avatar_ring_style} ringColor={profile?.avatar_ring_color} />
                    <div className="ss-topbar-account-copy">
                      <strong>{accountName}</strong>
                      <span>{profile?.username ? `@${profile.username}` : 'Signed-in account'}</span>
                      <Badge variant="save">{tierLabel}</Badge>
                    </div>
                  </div>

                  <Link role="menuitem" href={profileHref} className="ss-dropdown-item" onClick={navigate}>
                    <User size={15} /><span>Profile</span><ChevronRight size={13} />
                  </Link>
                  <Link role="menuitem" href="/bookmarks" className="ss-dropdown-item" onClick={navigate}>
                    <Bookmark size={15} /><span>Bookmarks</span><ChevronRight size={13} />
                  </Link>
                  <Link role="menuitem" href="/settings" className="ss-dropdown-item" onClick={navigate}>
                    <Settings size={15} /><span>Settings</span><ChevronRight size={13} />
                  </Link>
                  <Link role="menuitem" href="/settings/connections" className="ss-dropdown-item" onClick={navigate}>
                    <AtSign size={15} /><span>Connected accounts</span><ChevronRight size={13} />
                  </Link>
                  <Link role="menuitem" href="/settings/membership" className="ss-dropdown-item" onClick={navigate}>
                    <CreditCard size={15} /><span>Membership</span><ChevronRight size={13} />
                  </Link>
                  {(profile?.account_type === 'creator' || profile?.username?.toLowerCase() === 'slipsurge') && (
                    <>
                      <p className="ss-topbar-menu-label">Creator</p>
                      <Link role="menuitem" href="/creators/studio" className="ss-dropdown-item" onClick={navigate}>
                        <Sparkles size={15} /><span>Creator Studio</span><ChevronRight size={13} />
                      </Link>
                      <Link role="menuitem" href="/creators/payouts" className="ss-dropdown-item" onClick={navigate}>
                        <WalletCards size={15} /><span>Payouts</span><ChevronRight size={13} />
                      </Link>
                    </>
                  )}
                  {profile?.account_type === 'admin' && (
                    <Link role="menuitem" href="/admin" className="ss-dropdown-item" onClick={navigate}>
                      <Shield size={15} /><span>Admin</span><ChevronRight size={13} />
                    </Link>
                  )}
                  <Link role="menuitem" href="/support" className="ss-dropdown-item" onClick={navigate}>
                    <CircleHelp size={15} /><span>Help & support</span><ChevronRight size={13} />
                  </Link>
                  <div className="ss-account-appearance"><ThemeToggle full menu /></div>
                  <div className="ss-topbar-menu-separator" />
                  <button type="button" role="menuitem" className="ss-dropdown-item danger" onClick={signOut}>
                    <LogOut size={15} /><span>Sign out</span>
                  </button>
                  {signOutError && <p role="status">{signOutError}</p>}
                </div>
              </FloatingSurface>
            </div>)
}
