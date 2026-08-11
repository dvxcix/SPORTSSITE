'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ExternalLink, Menu, Search, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AdminCommandPalette } from '@/components/admin/AdminCommandPalette'
import { adminRouteForPath } from '@/components/admin/adminNavigation'
import { AdminSidebar } from '@/components/admin/AdminSidebar'

export function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  const path = usePathname()
  const [navOpen, setNavOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const route = adminRouteForPath(path)
  const title = route?.label ?? 'Admin workspace'
  const group = route?.group ?? 'Operations'
  const closeCommand = useCallback(() => setCommandOpen(false), [])
  const closeNav = useCallback(() => setNavOpen(false), [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen(current => !current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="flex min-h-dvh bg-[var(--bg)]">
      <a href="#admin-content" className="ss-skip-link">Skip to admin content</a>
      <AdminSidebar open={navOpen} onClose={closeNav} />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-[var(--layer-sticky)] flex min-h-16 items-center gap-2 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-3 py-2 backdrop-blur-2xl sm:gap-3 sm:px-5 lg:px-6">
          <button type="button" aria-label="Open admin navigation" onClick={() => setNavOpen(true)} className="grid size-10 shrink-0 place-items-center rounded-xl border border-[var(--border-2)] bg-[var(--surface)] text-[var(--text-2)] transition hover:border-[color-mix(in_srgb,var(--accent)_32%,var(--border-2))] hover:text-[var(--accent)] lg:hidden">
            <Menu size={18} aria-hidden="true" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.15em] text-[var(--text-3)]">
              <span>{group}</span><span aria-hidden="true">/</span><span className="truncate text-[var(--accent)]">{title}</span>
            </div>
            <p className="mt-0.5 truncate text-sm font-black text-[var(--text-1)] sm:text-base">{title}</p>
          </div>

          <button type="button" onClick={() => setCommandOpen(true)} className="hidden min-h-10 min-w-52 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-left text-xs font-semibold text-[var(--text-3)] transition hover:border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] hover:bg-[var(--surface-2)] hover:text-[var(--text-2)] md:flex xl:min-w-64">
            <Search size={14} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">Search admin tools</span>
            <kbd className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] font-black text-[var(--text-3)]">Ctrl K</kbd>
          </button>
          <button type="button" aria-label="Search admin tools" onClick={() => setCommandOpen(true)} className="grid size-10 shrink-0 place-items-center rounded-xl border border-[var(--border-2)] bg-[var(--surface)] text-[var(--text-2)] transition hover:text-[var(--accent)] md:hidden">
            <Search size={17} aria-hidden="true" />
          </button>

          <div className="hidden min-w-0 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 xl:flex">
            <ShieldCheck size={14} aria-hidden="true" className="shrink-0 text-[var(--accent)]" />
            <span className="max-w-44 truncate text-[10px] font-bold text-[var(--text-2)]">{email}</span>
          </div>
          <Link href="/" aria-label="Open SlipSurge" className="grid size-10 shrink-0 place-items-center rounded-xl border border-[var(--border-2)] bg-[var(--surface)] text-[var(--text-2)] transition hover:border-[color-mix(in_srgb,var(--accent)_32%,var(--border-2))] hover:text-[var(--accent)]">
            <ExternalLink size={16} aria-hidden="true" />
          </Link>
        </header>
        <main id="admin-content" tabIndex={-1} className="ss-admin-content min-w-0 pb-[max(24px,env(safe-area-inset-bottom))] focus:outline-none">{children}</main>
      </div>
      <AdminCommandPalette open={commandOpen} onClose={closeCommand} />
    </div>
  )
}
