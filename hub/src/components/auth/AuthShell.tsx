import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { LoaderCircle } from 'lucide-react'

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
    <main className="ss-auth-shell">
      <div className="ss-auth-orb" aria-hidden="true" />
      <section className={`ss-auth-panel${compact ? ' is-compact' : ''}`}>
        <Link href="/" className="ss-auth-brand" aria-label="SlipSurge home">
          <Image src="/logo.png" alt="" width={38} height={38} priority />
          <strong>Slip<span>Surge</span></strong>
        </Link>
        <header className="ss-auth-heading">
          {eyebrow && <p>{eyebrow}</p>}
          <h1>{title}</h1>
          {description && <span>{description}</span>}
        </header>
        {children}
      </section>
    </main>
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
