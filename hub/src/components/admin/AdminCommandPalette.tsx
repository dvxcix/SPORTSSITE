'use client'

import { useRouter } from 'next/navigation'
import { ArrowRight, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ADMIN_NAV_LINKS } from '@/components/admin/adminNavigation'

export function AdminCommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const [query, setQuery] = useState('')
  const close = useCallback(() => {
    setQuery('')
    onClose()
  }, [onClose])
  const normalizedQuery = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!normalizedQuery) return ADMIN_NAV_LINKS.slice(0, 9)
    return ADMIN_NAV_LINKS.filter(link =>
      [link.label, link.description, link.group, ...(link.keywords ?? [])]
        .some(value => value.toLowerCase().includes(normalizedQuery)),
    ).slice(0, 12)
  }, [normalizedQuery])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [close, open])

  if (!open) return null

  function go(href: string) {
    router.push(href)
    close()
  }

  return (
    <div className="fixed inset-0 z-[var(--layer-modal)] flex items-start justify-center bg-black/75 px-3 pt-[max(7vh,env(safe-area-inset-top))] backdrop-blur-md sm:px-6 sm:pt-[12vh]" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close() }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="admin-command-title" className="w-full max-w-2xl overflow-hidden rounded-3xl border border-[color-mix(in_srgb,var(--accent)_24%,var(--border))] bg-[color-mix(in_srgb,var(--surface)_97%,transparent)] shadow-[0_32px_100px_rgba(0,0,0,.78),0_0_50px_var(--accent-glow)]">
        <div className="flex min-h-16 items-center gap-3 border-b border-[var(--border)] px-4 sm:px-5">
          <Search size={18} aria-hidden="true" className="shrink-0 text-[var(--accent)]" />
          <label htmlFor="admin-command-search" className="sr-only">Search admin tools</label>
          <input
            ref={inputRef}
            type="search"
            autoComplete="off"
            id="admin-command-search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && matches[0]) go(matches[0].href)
            }}
            placeholder="Search members, creators, pipelines, settings..."
            className="h-16 min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-[var(--text-1)] outline-none placeholder:text-[var(--text-3)] sm:text-base"
          />
          <button type="button" onClick={close} aria-label="Close command palette" className="grid size-9 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-3)] transition hover:text-[var(--text-1)]">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[min(64dvh,560px)] overflow-y-auto overscroll-contain p-2 sm:p-3">
          <div className="px-2 pb-2 pt-1">
            <h2 id="admin-command-title" className="text-[10px] font-black uppercase tracking-[0.17em] text-[var(--text-3)]">{normalizedQuery ? 'Matching tools' : 'Quick access'}</h2>
          </div>
          <div className="space-y-1">
            {matches.map((link, index) => {
              const Icon = link.icon
              return (
                <button key={link.href} type="button" onClick={() => go(link.href)} className="group flex min-h-14 w-full items-center gap-3 rounded-2xl border border-transparent px-3 text-left transition hover:border-[var(--border)] hover:bg-[var(--surface-2)] focus-visible:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] focus-visible:bg-[var(--accent-dim)] sm:px-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--surface-3)] text-[var(--text-3)] transition group-hover:text-[var(--accent)]"><Icon size={16} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2"><strong className="truncate text-xs text-[var(--text-1)] sm:text-sm">{link.label}</strong><span className="hidden text-[9px] font-black uppercase tracking-[0.12em] text-[var(--text-3)] sm:inline">{link.group}</span></span>
                    <span className="mt-0.5 block truncate text-[10px] text-[var(--text-3)] sm:text-xs">{link.description}</span>
                  </span>
                  {index === 0 ? <span className="hidden rounded-md border border-[var(--border)] px-1.5 py-1 text-[9px] font-bold text-[var(--text-3)] sm:block">Enter</span> : <ArrowRight size={14} aria-hidden="true" className="text-[var(--text-3)] opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />}
                </button>
              )
            })}
            {matches.length === 0 ? (
              <div className="px-4 py-14 text-center">
                <Search size={22} aria-hidden="true" className="mx-auto mb-3 text-[var(--text-3)]" />
                <p className="text-sm font-bold text-[var(--text-2)]">No admin tools match that search.</p>
                <p className="mt-1 text-xs text-[var(--text-3)]">Try the task you want to complete.</p>
              </div>
            ) : null}
          </div>
        </div>
        <footer className="hidden items-center justify-between border-t border-[var(--border)] px-5 py-3 text-[10px] text-[var(--text-3)] sm:flex">
          <span>Search every operations workspace</span>
          <span>Esc to close</span>
        </footer>
      </section>
    </div>
  )
}
