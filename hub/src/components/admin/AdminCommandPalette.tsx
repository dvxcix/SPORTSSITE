'use client'

import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { useCallback, useId, useRef, useState } from 'react'
import { ADMIN_QUICK_LINKS, adminLinksForQuery } from '@/components/admin/adminNavigation'
import { ModalSurface } from '@/components/ui/ModalSurface'
import styles from './adminWorkspace.module.css'

export function AdminCommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter(), id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [query, setQuery] = useState('')
  const matches = query.trim() ? adminLinksForQuery(query).slice(0, 20) : ADMIN_QUICK_LINKS
  const close = useCallback(() => { setQuery(''); onClose() }, [onClose])
  function go(href: string) { router.push(href); close() }

  return <ModalSurface open={open} onClose={close} labelledBy={`${id}-title`} backdropClassName={styles.paletteBackdrop} panelClassName={styles.palette}>
    <div className={styles.paletteHeading}>
      <Search size={18} aria-hidden="true" />
      <label htmlFor={`${id}-search`} className="sr-only">Search admin tools</label>
      <input ref={inputRef} data-modal-autofocus id={`${id}-search`} type="search" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a member, setting or admin tool" onKeyDown={event => {
        if (event.key === 'Enter' && matches[0]) { event.preventDefault(); go(matches[0].href) }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          resultRefs.current[event.key === 'ArrowDown' ? 0 : matches.length - 1]?.focus()
        }
      }} />
      <button type="button" onClick={close} aria-label="Close command palette" className={styles.toolButton}><X size={17} aria-hidden="true" /></button>
    </div>
    <div className={styles.paletteResults}>
      <h2 id={`${id}-title`}>{query.trim() ? `${matches.length} matching ${matches.length === 1 ? 'tool' : 'tools'}` : 'Frequent tasks'}</h2>
      {matches.map((link, index) => {
        const Icon = link.icon
        return <button ref={element => { resultRefs.current[index] = element }} key={link.href} type="button" onClick={() => go(link.href)} onKeyDown={event => {
          let next: number | undefined
          if (event.key === 'ArrowDown') next = index + 1
          if (event.key === 'ArrowUp') next = index - 1
          if (event.key === 'Home') next = 0
          if (event.key === 'End') next = matches.length - 1
          if (next !== undefined) { event.preventDefault(); (resultRefs.current[next] ?? inputRef.current)?.focus() }
        }}><Icon size={18} aria-hidden="true" /><span><strong>{link.label}</strong><small>{link.group} · {link.description}</small></span></button>
      })}
      {!matches.length && <div className={styles.noResults} role="status"><p>No admin tools match “{query}”.</p><p>Try a task such as members, payments or releases.</p></div>}
    </div>
    <footer className={styles.paletteFooter}><span>↑ ↓ to move · Enter to open</span><span>Esc to close</span></footer>
  </ModalSurface>
}
