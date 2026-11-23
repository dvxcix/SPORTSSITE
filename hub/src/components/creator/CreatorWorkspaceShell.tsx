'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowUpRight, BarChart3, CalendarDays, ChevronRight, LayoutDashboard, Menu, Package, Settings2, Store, UsersRound, Wallet } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { AccountMenu } from '@/components/layout/AccountMenu'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { CreatorDialog } from './CreatorDialog'
import styles from './creatorWorkspace.module.css'

const sections = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'communities', label: 'Communities', icon: Store },
  { id: 'members', label: 'Members', icon: UsersRound },
  { id: 'content', label: 'Content', icon: CalendarDays },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'payouts', label: 'Balance & payouts', icon: Wallet },
  { id: 'settings', label: 'Settings', icon: Settings2 },
]

export function CreatorWorkspaceShell({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={children}><Workspace>{children}</Workspace></Suspense>
}

function Workspace({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const params = useSearchParams()
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const section = path === '/creators/payouts' ? 'payouts' : params.get('section') || 'overview'
  const title = sections.find(item => item.id === section)?.label || 'Overview'
  const navigation = (mobile = false) => <>
    <Link href="/creators/studio" className={styles.brand} onClick={() => setOpen(false)}><Image src="/icon-192.png" alt="SlipSurge" width={30} height={30}/><strong>SlipSurge<span>Creator Studio</span></strong></Link>
    <div className={styles.workspaceIdentity}><MemberAvatar src={profile?.avatar_url} name={profile?.display_name || profile?.username || 'Creator'} size={36} ringStyle={profile?.avatar_ring_style} ringColor={profile?.avatar_ring_color}/><span><strong>{profile?.display_name || profile?.username || 'Your storefront'}</strong><small>Creator workspace</small></span></div>
    <nav aria-label="Creator workspace">{sections.map(item => <Link key={item.id} aria-current={section === item.id ? 'page' : undefined} href={item.id === 'payouts' ? '/creators/payouts' : '/creators/studio?section=' + item.id} onClick={() => setOpen(false)}><item.icon size={18}/><span>{item.label}</span></Link>)}</nav>
    <div className={styles.sidebarBottom}><Link href="/launch"><ArrowLeft size={16}/>Back to SlipSurge</Link>{!mobile && <AccountMenu placement="sidebar"/>}</div>
  </>
  return <div className={styles.workspace}>
    <a className="ss-skip-link" href="#main-content">Skip to creator content</a>
    <aside className={styles.sidebar}>{navigation()}</aside>
    <div className={styles.workspaceMain}>
      <header className={styles.topbar}><button className={styles.menuButton} type="button" aria-label="Open creator navigation" onClick={() => setOpen(true)}><Menu size={19}/></button><div className={styles.breadcrumb}><span>Studio</span><ChevronRight size={13}/><strong>{title}</strong></div><div className={styles.topbarActions}><ThemeToggle/>{profile?.username && <Link href={'/creators/' + profile.username}>View storefront <ArrowUpRight size={15}/></Link>}<div className={styles.mobileAccount}><AccountMenu compact/></div></div></header>
      <main id="main-content" tabIndex={-1} className={styles.content}>{children}</main>
    </div>
    {open && <CreatorDialog title="Creator Studio" onClose={() => setOpen(false)} narrow><div className={styles.mobileNavigation}>{navigation(true)}</div></CreatorDialog>}
  </div>
}

export function CreatorMarketShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  return <div className={styles.marketShell}><a className="ss-skip-link" href="#main-content">Skip to content</a><header className={styles.marketHeader}><Link href="/creators" className={styles.marketBrand}><Image src="/icon-192.png" width={29} height={29} alt="SlipSurge"/><strong>SlipSurge</strong></Link><nav aria-label="Creator marketplace"><Link href="/creators">Discover</Link><Link href="/groups">My communities</Link></nav><div className={styles.topbarActions}><ThemeToggle/>{user ? <><Link className={styles.studioLink} href="/creators/studio">Creator Studio <ArrowUpRight size={14}/></Link><AccountMenu compact/></> : !loading ? <Link href="/auth/login?next=%2Fcreators">Sign in</Link> : null}</div></header><main id="main-content" tabIndex={-1}>{children}</main></div>
}
