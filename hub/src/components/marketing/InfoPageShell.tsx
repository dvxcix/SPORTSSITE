import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import Image from 'next/image'
import styles from './InfoPageShell.module.css'

export function InfoPageShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <Link href="/" className={styles.brand}><Image src="/logo.png" alt="" width={28} height={28}/><span>Slip<span>Surge</span></span></Link>
        <Link href="/" className={styles.back}><ArrowLeft size={14} /> Home</Link>
      </header>
      <div className={styles.main}>
        <header className={styles.hero}><span className={styles.eyebrow}>SlipSurge</span><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</header>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  )
}

export function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className={styles.section}>
      <h2>{title}</h2>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  )
}

export function InfoCallout({ icon, title, description, href }: { icon: React.ReactNode; title: string; description: string; href?: string }) {
  const heading = href ? <a href={href}>{title}</a> : <strong>{title}</strong>
  return <div className={styles.callout}><span className={styles.calloutIcon}>{icon}</span><div>{heading}<p>{description}</p></div></div>
}

export function InfoInlineLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className={styles.inlineLink}>{children}</Link>
}

// Anchor-link jump list for a long policy page — sections it links to must
// each pass the matching `id` to Section above.
export function Toc({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav aria-label="Table of contents" className={styles.toc}>
      <strong>On this page</strong>
      <ol>
        {items.map((item, i) => (
          <li key={item.id}>
            <a href={`#${item.id}`}>{i + 1}. {item.label}</a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
