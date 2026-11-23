import Link from 'next/link'
import { PublicSiteHeader } from '@/components/marketing/PublicSiteHeader'
import styles from './VisitorBrowseShell.module.css'

export function VisitorBrowseShell({ pathname, children }: { pathname:string; children:React.ReactNode }) {
  return <div className={styles.shell}>
    <PublicSiteHeader mode="browse" pathname={pathname} returnTo={pathname} />
    <main id="main-content" tabIndex={-1} className={styles.content}>{children}</main>
    <footer className={styles.footer}>
      <Link href="/preview/nba">Try The Court</Link>
      <Link href="/preview/nfl">Try The Sideline</Link>
      <span className={styles.divider} aria-hidden="true" />
      <Link href="/pricing">Membership</Link>
      <Link href="/support">Help</Link>
      <Link href="/terms">Terms</Link>
      <Link href="/privacy">Privacy</Link>
    </footer>
  </div>
}
