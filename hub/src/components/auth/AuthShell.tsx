import type { ReactNode } from 'react'
import Link from 'next/link'
import { LoaderCircle } from 'lucide-react'
import { AuthBrand, AuthExperience, authExperienceStyles as styles } from '@/components/auth/AuthExperience'

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  compact = false,
}: {
  eyebrow?: string
  title: string
  description?: string
  children: ReactNode
  compact?: boolean
}) {
  return (
    <AuthExperience panelWidth={compact ? 'compact' : 'wide'} aside={<>
      <AuthBrand />
      <h2 className={styles.asideTitle}>One account.<br/><span>Every edge.</span></h2>
      <p className={styles.asideCopy}>Return to your live boards, communities, saved research, and picks without losing your place.</p>
    </>}>
      <div className={`ss-auth-panel-content${compact ? ' is-compact' : ''}`}>
        <header className="ss-auth-heading">
          {eyebrow && <p>{eyebrow}</p>}
          <h1>{title}</h1>
          {description && <span>{description}</span>}
        </header>
        {children}
      </div>
    </AuthExperience>
  )
}

export function AuthStatus({ error, children }: { error?: string; children: ReactNode }) {
  return (
    <AuthShell eyebrow={error ? 'Action needed' : 'Secure sign-in'} title={error ? 'We could not continue' : 'One moment'} compact>
      <div className={`ss-auth-status${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>
        {!error && <LoaderCircle size={19} className="animate-spin" aria-hidden="true" />}
        <p>{error || children}</p>
        {error && <Link href="/auth/login">Back to sign in</Link>}
      </div>
    </AuthShell>
  )
}
