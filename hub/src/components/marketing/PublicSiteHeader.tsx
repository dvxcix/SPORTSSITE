import { SlipSurgeLogo } from '@/components/brand/SlipSurgeLogo'
import Link from 'next/link'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import styles from './PublicSiteHeader.module.css'

const browseLinks = [
  { href: '/feed', label: 'Feed' },
  { href: '/#research', label: 'Research' },
  { href: '/groups', label: 'Communities' },
  { href: '/creators', label: 'Creators' },
  { href: '/sports', label: 'Scores' },
  { href: '/leaderboard', label: 'Records' },
]

export function PublicSiteHeader({ returnTo, mode = 'marketing', pathname }: { returnTo?: string; mode?: 'marketing' | 'browse'; pathname?: string }) {
  const next = returnTo?.startsWith('/') && !returnTo.startsWith('//') && !/[\\\r\n]/.test(returnTo) ? returnTo : null
  const signIn = next ? '/auth/login?next=' + encodeURIComponent(next) : '/auth/login'

  return <header className={styles.header}>
    <a className={styles.skip} href="#main-content">Skip to content</a>
    <div className={styles.inner}>
      <Link href="/" className={styles.brand} aria-label="SlipSurge home">
        <SlipSurgeLogo width={144} decorative priority />
      </Link>
      <nav className={styles.navigation} data-mode={mode} aria-label={mode === 'browse' ? 'Public browsing' : 'Product navigation'}>
        {mode === 'browse' ? browseLinks.map(({ href, label }) => <Link key={href} href={href}
          aria-current={pathname === href || (href === '/groups' || href === '/creators') && pathname?.startsWith(href + '/') ? 'page' : undefined}>{label}</Link>) : <>
          <Link href="/#research">Research</Link>
          <Link href="/groups">Communities</Link>
          <Link href="/pricing">Membership</Link>
        </>}
      </nav>
      <div className={styles.actions}>
        <Link href={signIn} className={styles.signIn}>Sign in</Link>
        <ThemeToggle />
      </div>
    </div>
  </header>
}
