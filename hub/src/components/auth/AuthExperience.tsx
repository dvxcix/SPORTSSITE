'use client'

import type { ReactNode } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { BackgroundBeams } from '@/components/ui/background-beams'
import { Spotlight } from '@/components/ui/spotlight'
import styles from './AuthExperience.module.css'

const Meteors = dynamic(() => import('@/components/ui/meteors').then(module => module.Meteors), { ssr: false })

export function AuthExperience({
  aside,
  children,
  spotlight = false,
  panelWidth = 'wide',
}: {
  aside: ReactNode
  children: ReactNode
  spotlight?: boolean
  panelWidth?: 'wide' | 'compact'
}) {
  return (
    <div className={styles.shell}>
      <aside className={styles.aside}>
        <div className={styles.glow} aria-hidden="true" />
        {spotlight ? <Spotlight className="left-0 top-0" fill="#B4FF4D" /> : <BackgroundBeams className="opacity-40" />}
        <div className={styles.meteors} aria-hidden="true"><Meteors number={14} className="opacity-60" /></div>
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
