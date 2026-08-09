'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ExternalLink, Menu, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { AdminSidebar } from '@/components/admin/AdminSidebar'

const LABELS: Record<string, string> = {
  admin: 'Dashboard', users: 'Users', content: 'Content', settings: 'Settings',
  'design-system': 'Design system', 'pipeline-health': 'Pipeline health',
  'fanduel-import': 'FanDuel markets', 'mgm-import': 'BetMGM odds',
  'pikkit-import': 'Pikkit import', 'social-platforms': 'Connected accounts',
  'site-banner': 'Site banner', changelog: 'Changelog',
}

function titleForPath(path: string) {
  const segment = path.split('/').filter(Boolean).at(-1) ?? 'admin'
  return LABELS[segment] ?? segment.replaceAll('-', ' ').replace(/\b\w/g, character => character.toUpperCase())
}

export function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  const path = usePathname()
  const [navOpen, setNavOpen] = useState(false)
  const title = titleForPath(path)

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      <AdminSidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-[var(--layer-sticky)] flex h-16 items-center gap-3 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_90%,transparent)] px-4 backdrop-blur-xl sm:px-6">
          <button aria-label="Open admin navigation" onClick={() => setNavOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border-2)] bg-[var(--surface)] text-[var(--text-2)] hover:text-[var(--text-1)] lg:hidden"><Menu size={18} /></button>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-[var(--text-1)]">{title}</p><p className="hidden text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-3)] sm:block">SlipSurge operations</p></div>
          <div className="hidden items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 sm:flex"><ShieldCheck size={14} className="text-[var(--accent)]" /><span className="max-w-48 truncate text-xs font-semibold text-[var(--text-2)]">{email}</span></div>
          <Link href="/" aria-label="Open SlipSurge" className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border-2)] bg-[var(--surface)] text-[var(--text-2)] transition-colors hover:border-[var(--border-3)] hover:text-[var(--text-1)]"><ExternalLink size={16} /></Link>
        </header>
        <main id="admin-content" className="min-w-0">{children}</main>
      </div>
    </div>
  )
}
