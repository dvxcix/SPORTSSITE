'use client'

import { SlipSurgeLogo } from '@/components/brand/SlipSurgeLogo'
import Link from 'next/link'
import { AccountMenu } from '@/components/layout/AccountMenu'
import { usePathname } from 'next/navigation'
import { ChevronDown, Search, X } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { ADMIN_NAV_GROUPS, adminLinksForQuery, adminRouteForPath } from '@/components/admin/adminNavigation'
import { cn } from '@/lib/utils'
import { ModalSurface } from '@/components/ui/ModalSurface'
import styles from './adminWorkspace.module.css'

export function AdminSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <>
    <aside aria-label="Admin workspace navigation" className={`ss-admin-sidebar ${styles.sidebar}`}><AdminNavigationBody onClose={onClose} /></aside>
    <ModalSurface open={open} onClose={onClose} label="Admin navigation" backdropClassName={styles.mobileBackdrop} panelClassName={styles.mobileSidebar}><AdminNavigationBody onClose={onClose} /></ModalSurface>
  </>
}

function AdminNavigationBody({ onClose }: { onClose: () => void }) {
  const path = usePathname()
  const id = useId()
  const [query, setQuery] = useState('')
  const activeRoute = adminRouteForPath(path)
  const activeGroup = activeRoute?.group
  const [expanded, setExpanded] = useState<string[]>(() => activeGroup ? [activeGroup] : ['Overview'])
  const normalizedQuery = query.trim().toLowerCase()

  const visibleGroups = useMemo(() => {
    if (!normalizedQuery) return ADMIN_NAV_GROUPS
    const matching = new Set(adminLinksForQuery(query).map(link => link.href))
    return ADMIN_NAV_GROUPS.flatMap(group => {
      const links = group.links.filter(link => matching.has(link.href))
      return links.length ? [{ ...group, links }] : []
    })
  }, [normalizedQuery, query])

  function toggle(label: string) {
    setExpanded(current => current.includes(label)
      ? current.filter(value => value !== label)
      : [...current, label])
  }

  return (
    <>
        <div className={styles.sidebarHeader}>
          <Link href="/admin" aria-label="SlipSurge admin home" onClick={onClose}><span><SlipSurgeLogo width={136} decorative/><small>Administration</small></span></Link>
          <button type="button" aria-label="Close admin navigation" onClick={onClose} className={styles.toolButton}>
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="border-b border-[var(--border)] px-3 py-3">
          <label className="relative block">
            <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
            <span className="sr-only">Filter admin tools</span>
            <input
              data-modal-autofocus
              type="search"
              autoComplete="off"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Find an admin tool"
              className="ss-input h-10 rounded-xl pl-9 pr-3 text-xs"
            />
          </label>
        </div>

        <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-3" aria-label="Admin tools">
          <div className="space-y-2.5">
            {visibleGroups.map(group => {
              const hasActiveLink = group.label === activeGroup
              const isOpen = normalizedQuery.length > 0 || expanded.includes(group.label) || hasActiveLink
              return (
                <section key={group.label} aria-labelledby={`${id}-${group.label.replaceAll(' ', '-').toLowerCase()}`}>
                  <button
                    type="button"
                    id={`${id}-${group.label.replaceAll(' ', '-').toLowerCase()}`}
                    aria-expanded={isOpen}
                    onClick={() => toggle(group.label)}
                    className={cn(
                      'group flex min-h-11 w-full items-center gap-2 rounded-xl px-2.5 text-left transition-colors',
                      hasActiveLink ? 'text-[var(--text-1)]' : 'text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-[var(--text-2)]',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold">{group.label}</span>
                      <span className="sr-only">{group.description}</span>
                    </span>
                    <ChevronDown size={14} aria-hidden="true" className={cn('shrink-0 transition-transform', !isOpen && '-rotate-90')} />
                  </button>

                  {isOpen ? (
                    <div className="mt-1 space-y-1">
                      {group.links.map(link => {
                        const Icon = link.icon
                        const active = activeRoute?.href === link.href
                        return (
                          <Link
                            key={link.href}
                            href={link.href}
                            onClick={onClose}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                              'group/link relative flex min-h-11 items-center gap-3 overflow-hidden rounded-xl px-3 transition duration-[var(--duration-fast)]',
                              active
                                ? 'border border-[color-mix(in_srgb,var(--accent)_24%,transparent)] bg-[var(--accent-dim)] text-[var(--accent)] shadow-[inset_0_1px_rgba(255,255,255,.035)]'
                                : 'border border-transparent text-[var(--text-2)] hover:border-[var(--border)] hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]',
                            )}
                          >
                            <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', active ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]' : 'bg-[var(--surface-3)] text-[var(--text-3)] group-hover/link:text-[var(--accent)]')}>
                              <Icon size={15} aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-semibold">{link.label}</span>
                              <span className="sr-only">{link.description}</span>
                            </span>
                          </Link>
                        )
                      })}
                    </div>
                  ) : null}
                </section>
              )
            })}
            {visibleGroups.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border-2)] px-4 py-10 text-center">
                <Search size={18} aria-hidden="true" className="mx-auto mb-2 text-[var(--text-3)]" />
                <p className="text-xs font-bold text-[var(--text-2)]">No tools found</p>
                <p className="mt-1 text-[12px] text-[var(--text-3)]">Try a page name or task.</p>
              </div>
            ) : null}
          </div>
        </nav>

        <div className="border-t border-[var(--border)] p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <Link href="/feed" onClick={onClose} className="flex min-h-11 items-center justify-center rounded-xl border border-[var(--border-2)] bg-[var(--surface-2)] px-3 text-xs font-extrabold text-[var(--text-2)] transition hover:border-[color-mix(in_srgb,var(--accent)_35%,var(--border-2))] hover:text-[var(--accent)]">
            Return to SlipSurge
          </Link>
        </div>
        <div className="ss-admin-account"><AccountMenu placement="sidebar" onNavigate={onClose}/></div>
    </>
  )
}
