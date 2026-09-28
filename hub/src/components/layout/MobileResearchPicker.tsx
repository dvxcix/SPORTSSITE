'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { ArrowUpRight, Layers3, X } from 'lucide-react'
import { SafeImage } from '@/components/ui/SafeImage'
import { areaNavigation } from './navigationConfig'
import { researchSportForPath, researchToolActive, researchToolHref, type ResearchSport } from './researchNavigation'
import styles from './mobileResearch.module.css'

export function MobileResearchPicker({ path, sport, nflAccess, hasUltimate, onSport, onClose }: {
  path: string; sport: ResearchSport; nflAccess: boolean; hasUltimate: boolean
  onSport: (sport: ResearchSport) => void; onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  const search = useSearchParams()
  const sports: ResearchSport[] = nflAccess ? ['nfl', 'mlb'] : ['mlb']
  const selected = nflAccess ? sport : 'mlb'
  const tools = areaNavigation.research.filter(item => researchSportForPath(item.href.split('?')[0]) === selected && !['/dugout', '/the-sideline'].includes(item.href) && (!item.ultimateOnly || hasUltimate))

  useEffect(() => {
    const node = dialog.current
    const previous = document.body.style.overflow
    const previousFocus = document.activeElement as HTMLElement | null
    node?.showModal()
    document.body.style.overflow = 'hidden'
    const media = window.matchMedia('(max-width:767px), (max-width:1024px) and (any-pointer:coarse)')
    const resized = () => { if (!media.matches) closeRef.current() }
    media.addEventListener('change', resized)
    return () => { media.removeEventListener('change', resized); node?.close(); document.body.style.overflow = previous; if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }) }
  }, [])

  const href = (value: string) => researchToolHref(value, path, search)
  return <dialog ref={dialog} className={styles.sheet} aria-labelledby="research-picker-title" onCancel={onClose} onClose={onClose} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className={styles.content}>
      <header className={styles.header}><div><small>YOUR SPORTS</small><h2 id="research-picker-title">Research</h2></div><button type="button" onClick={onClose} aria-label="Close research menu"><X size={20} /></button></header>
      <div className={styles.boards}>
        {sports.map(value => <Link key={value} prefetch={false} href={href(value === 'nfl' ? '/the-sideline' : '/dugout')} className={styles.board} data-current={researchSportForPath(path) === value} onClick={() => { onSport(value); onClose() }}>
          <SafeImage src={`https://a.espncdn.com/i/teamlogos/leagues/500/${value}.png`} alt="" />
          <span><small>{value.toUpperCase()}</small><strong>{value === 'nfl' ? 'The Sideline' : 'The Dugout'}</strong></span><ArrowUpRight size={16} aria-hidden="true" />
        </Link>)}
      </div>
      <div className={styles.tabs} role="group" aria-label="Sport tools">
        {sports.map(value => <button key={value} type="button" aria-pressed={selected === value} onClick={() => onSport(value)}>{value.toUpperCase()} tools</button>)}
      </div>
      <nav className={styles.tools} aria-label={selected.toUpperCase() + ' quick tools'}>
        {tools.map(item => <Link key={item.href} href={href(item.href)} prefetch={false} aria-current={researchToolActive(item.href, path, search) ? 'page' : undefined} onClick={onClose}><item.icon size={18} aria-hidden="true" /><span>{item.label.replace(/^NFL /, '')}</span></Link>)}
      </nav>
      <Link className={styles.workspace} href="/workspace" prefetch={false} onClick={onClose}><Layers3 size={18} aria-hidden="true" /><span>Research Workspace</span><ArrowUpRight size={16} aria-hidden="true" /></Link>
    </div>
  </dialog>
}
