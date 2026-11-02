'use client'

import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import styles from './AuthExperience.module.css'

export function AuthExperience({
  aside,
  children,
  panelWidth = 'wide',
}: {
  aside: ReactNode
  children: ReactNode
  panelWidth?: 'wide' | 'compact'
}) {
  return (
    <div className={styles.shell}>
      <aside className={styles.aside}>
        <div className={styles.asideContent}>{aside}</div>
      </aside>
      <section className={`${styles.panel} ${panelWidth === 'compact' ? styles.panelCompact : ''}`}>
        <AuthBrand mobile />
        {children}
      </section>
    </div>
  )
}

export function AuthBrand({ mobile = false }: { mobile?: boolean }) {
  return (
    <Link href="/" className={`${styles.brand} ${mobile ? styles.mobileBrand : ''}`} aria-label="SlipSurge home">
      <Image src="/logo.png" alt="" width={mobile ? 32 : 44} height={mobile ? 32 : 44} priority />
      <strong>Slip<span>Surge</span></strong>
    </Link>
  )
}

export function AuthHeading({ title, description }: { title: string; description: string }) {
  return <header className={styles.heading}><h1>{title}</h1><p>{description}</p></header>
}

export function ProviderButton({ provider, onClick, children }: {
  provider: 'whop' | 'discord' | 'x'
  onClick: () => void
  children: ReactNode
}) {
  return <button type="button" onClick={onClick} className={`${styles.provider} ${styles[`provider_${provider}`]}`}>{children}</button>
}

export function AuthDivider() {
  return <div className={styles.divider}><span>or</span></div>
}

export function AuthField({ label, children }: { label: string; children: ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{children}</label>
}

export function AuthAlert({ children }: { children: ReactNode }) {
  return <div className={styles.alert} role="alert">{children}</div>
}

export function AuthSubmit({ disabled, children }: { disabled?: boolean; children: ReactNode }) {
  return <button type="submit" disabled={disabled} className={styles.submit}>{children}</button>
}

export { styles as authExperienceStyles }
