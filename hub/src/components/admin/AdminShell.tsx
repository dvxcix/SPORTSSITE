'use client'

import { ThemeToggle } from '@/components/theme/ThemeToggle'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ExternalLink, Menu, Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AdminCommandPalette } from '@/components/admin/AdminCommandPalette'
import { ADMIN_NAV_GROUPS, adminRouteForPath } from '@/components/admin/adminNavigation'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import styles from './adminWorkspace.module.css'

export function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  const path = usePathname(), router = useRouter()
  const [navOpen, setNavOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const route = adminRouteForPath(path)
  const group = ADMIN_NAV_GROUPS.find(item => item.label === route?.group) ?? ADMIN_NAV_GROUPS[0]
  const closeCommand = useCallback(() => setCommandOpen(false), [])
  const closeNav = useCallback(() => setNavOpen(false), [])

  useEffect(() => {
    const desktop = window.matchMedia('(min-width:1024px)')
    const onResize = () => { if (desktop.matches) closeNav() }
    desktop.addEventListener('change', onResize)
    return () => desktop.removeEventListener('change', onResize)
  }, [closeNav])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setNavOpen(false)
        setCommandOpen(current => !current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className={styles.shell}>
      <a href="#admin-content" className="ss-skip-link">Skip to admin content</a>
      <AdminSidebar open={navOpen} onClose={closeNav} />
      <div className={styles.body}>
        <header className={styles.toolbar}>
          <button type="button" aria-label="Open admin navigation" aria-expanded={navOpen} onClick={() => setNavOpen(true)} className={`${styles.toolButton} ${styles.navTrigger}`}>
            <Menu size={18} aria-hidden="true" />
          </button>
          <label className={styles.location}>
            <span>{group.label}</span>
            <span className="sr-only">Admin workspace section</span>
            <select aria-label="Admin workspace section" value={route?.href ?? '/admin'} onChange={event => router.push(event.target.value)}>
              {group.links.map(link => <option key={link.href} value={link.href}>{link.label}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => setCommandOpen(true)} className={`${styles.toolButton} ${styles.search}`}>
            <Search size={15} aria-hidden="true" /><span>Search admin tools</span><kbd>Ctrl K</kbd>
          </button>
          <button type="button" aria-label="Search admin tools" onClick={() => setCommandOpen(true)} className={`${styles.toolButton} ${styles.searchIcon}`}>
            <Search size={18} aria-hidden="true" />
          </button>
          <span className="sr-only">Administrator: {email}</span>
          <div className={styles.appearance}><ThemeToggle /></div>
          <Link href="/feed" aria-label="Return to SlipSurge" className={`${styles.toolButton} ${styles.siteReturn}`}><ExternalLink size={17} aria-hidden="true" /></Link>
        </header>
        <main id="admin-content" tabIndex={-1} className="ss-admin-content focus:outline-none">{children}</main>
      </div>
      <AdminCommandPalette open={commandOpen} onClose={closeCommand} />
    </div>
  )
}
