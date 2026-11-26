'use client'

import { SlipSurgeLogo } from '@/components/brand/SlipSurgeLogo'
import Link from 'next/link'
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { ModalSurface } from '@/components/ui/ModalSurface'
import { PUBLIC_WORKSPACE_ACCESS_EVENT, publicWorkspaceHref } from '@/lib/publicWorkspaceClient'
import type { PreviewSport } from '@/lib/publicResearchPreview'
import styles from './PublicWorkspaceFrame.module.css'

export function PublicWorkspaceFrame({ sport, game, date, children }: { sport: PreviewSport; game: string; date: string; children: ReactNode }) {
  const router = useRouter(), [access, setAccess] = useState(false)
  useEffect(() => { const open = () => setAccess(true); window.addEventListener(PUBLIC_WORKSPACE_ACCESS_EVENT, open); return () => window.removeEventListener(PUBLIC_WORKSPACE_ACCESS_EVENT, open) }, [])
  function navigate(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]')
    const href = anchor?.getAttribute('href')
    if (!href || anchor?.target === '_blank') return
    if (/^\/(nba\/(players|teams)|players)\//.test(href)) { event.preventDefault(); setAccess(true); return }
    const next = publicWorkspaceHref(href)
    if (next !== href && !next.includes('/data?')) { event.preventDefault(); router.push(next, { scroll: false }) }
  }
  const pricing = '/pricing?' + new URLSearchParams({ preview: sport, game, date })
  return <div className={styles.page} onClickCapture={navigate}>
    <header className={styles.header}><Link className={styles.brand} href="/" aria-label="SlipSurge home"><SlipSurgeLogo width={130} decorative priority/></Link><nav aria-label="Research previews"><Link href="/preview/nba" aria-current={sport === 'nba' ? 'page' : undefined}>NBA</Link><Link href="/preview/nfl" aria-current={sport === 'nfl' ? 'page' : undefined}>NFL</Link></nav><div className={styles.actions}><ThemeToggle/><Link href="/auth/login">Sign in</Link></div></header>
    <div className={styles.notice}><span><strong>One game unlocked</strong><span>Use the actual {sport === 'nba' ? 'Court' : 'Sideline'} boards and player research.</span></span><Link href={pricing}>Unlock the full slate</Link></div>
    <main id="main-content" className={styles.workspace}>{children}</main>
    <ModalSurface open={access} onClose={() => setAccess(false)} labelledBy="preview-access-title" backdropClassName={styles.backdrop}>
      <section className={styles.dialog}><header><h2 id="preview-access-title">Take your research further</h2><button type="button" aria-label="Close membership details" onClick={() => setAccess(false)}><X size={20}/></button></header><p>This matchup is open to explore. Membership unlocks the full slate and your saved tools.</p><Link href={pricing}>See membership options</Link><button type="button" onClick={() => setAccess(false)}>Keep researching this game</button></section>
    </ModalSurface>
  </div>
}
