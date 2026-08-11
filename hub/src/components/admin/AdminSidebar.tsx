'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown, Search, Shield, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ADMIN_NAV_GROUPS, adminPathIsActive } from '@/components/admin/adminNavigation'
import { cn } from '@/lib/utils'

export function AdminSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const path = usePathname()
  const [query, setQuery] = useState('')
  const activeGroup = ADMIN_NAV_GROUPS.find(group => group.links.some(link => adminPathIsActive(path, link.href)))?.label
  const [expanded, setExpanded] = useState<string[]>(() => activeGroup ? [activeGroup] : ['Overview'])
  const normalizedQuery = query.trim().toLowerCase()

  const visibleGroups = useMemo(() => {
    if (!normalizedQuery) return ADMIN_NAV_GROUPS
    return ADMIN_NAV_GROUPS.flatMap(group => {
      const links = group.links.filter(link =>
        [link.label, link.description, group.label, ...(link.keywords ?? [])]
          .some(value => value.toLowerCase().includes(normalizedQuery)),
      )
      return links.length ? [{ ...group, links }] : []
    })
  }, [normalizedQuery])

  function toggle(label: string) {
    setExpanded(current => current.includes(label)
      ? current.filter(value => value !== label)
      : [...current, label])
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close admin navigation"
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-[calc(var(--layer-popover)-1)] bg-black/70 backdrop-blur-sm transition-opacity lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      <aside
        aria-label="Admin workspace navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-[var(--layer-popover)] flex h-dvh w-[292px] flex-col overflow-hidden border-r border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_97%,transparent)] shadow-[var(--shadow-overlay)] backdrop-blur-2xl transition-transform duration-[var(--duration-normal)] lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 lg:shadow-none',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="relative flex min-h-20 items-center gap-3 overflow-hidden border-b border-[var(--border)] px-4">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0,color-mix(in_srgb,var(--accent)_13%,transparent),transparent_62%)]" />
          <span className="relative grid size-10 shrink-0 place-items-center rounded-2xl border border-[color-mix(in_srgb,var(--accent)_32%,transparent)] bg-[var(--accent-dim)] text-[var(--accent)] shadow-[0_0_26px_var(--accent-glow)]">
            <Shield size={19} aria-hidden="true" />
          </span>
          <div className="relative min-w-0 flex-1">
            <p className="truncate text-sm font-black text-[var(--text-1)]">SlipSurge Control</p>
            <p className="mt-0.5 text-[9px] font-black uppercase tracking-[0.19em] text-[var(--text-3)]">Operations workspace</p>
          </div>
          <button type="button" aria-label="Close navigation" onClick={onClose} className="relative grid size-9 shrink-0 place-items-center rounded-xl text-[var(--text-3)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-1)] lg:hidden">
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="border-b border-[var(--border)] px-3 py-3">
          <label className="relative block">
            <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
            <span className="sr-only">Filter admin tools</span>
            <input
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
              const hasActiveLink = group.links.some(link => adminPathIsActive(path, link.href))
              const isOpen = normalizedQuery.length > 0 || expanded.includes(group.label) || hasActiveLink
              return (
                <section key={group.label} aria-labelledby={`admin-nav-${group.label.replaceAll(' ', '-').toLowerCase()}`}>
                  <button
                    type="button"
                    id={`admin-nav-${group.label.replaceAll(' ', '-').toLowerCase()}`}
                    aria-expanded={isOpen}
                    onClick={() => toggle(group.label)}
                    className={cn(
                      'group flex min-h-10 w-full items-center gap-2 rounded-xl px-2.5 text-left transition-colors',
                      hasActiveLink ? 'text-[var(--text-1)]' : 'text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-[var(--text-2)]',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] font-black uppercase tracking-[0.14em]">{group.label}</span>
                      <span className="mt-0.5 block truncate text-[9px] font-medium normal-case tracking-normal text-[var(--text-3)]">{group.description}</span>
                    </span>
                    <ChevronDown size={14} aria-hidden="true" className={cn('shrink-0 transition-transform', !isOpen && '-rotate-90')} />
                  </button>

                  {isOpen ? (
                    <div className="mt-1 space-y-1">
                      {group.links.map(link => {
                        const Icon = link.icon
                        const active = adminPathIsActive(path, link.href)
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
                            {active ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[var(--accent)] shadow-[0_0_12px_var(--accent)]" /> : null}
                            <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', active ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]' : 'bg-[var(--surface-3)] text-[var(--text-3)] group-hover/link:text-[var(--accent)]')}>
                              <Icon size={15} aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-extrabold">{link.label}</span>
                              <span className="mt-0.5 block truncate text-[9px] font-medium text-[var(--text-3)]">{link.description}</span>
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
                <p className="mt-1 text-[10px] text-[var(--text-3)]">Try a page name or task.</p>
              </div>
            ) : null}
          </div>
        </nav>

        <div className="border-t border-[var(--border)] p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <Link href="/" className="flex min-h-11 items-center justify-center rounded-xl border border-[var(--border-2)] bg-[var(--surface-2)] px-3 text-xs font-extrabold text-[var(--text-2)] transition hover:border-[color-mix(in_srgb,var(--accent)_35%,var(--border-2))] hover:text-[var(--accent)]">
            Return to SlipSurge
          </Link>
        </div>
      </aside>
    </>
  )
}
