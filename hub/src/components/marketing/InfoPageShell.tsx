import Link from 'next/link'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import styles from './InfoPageShell.module.css'

export function InfoPageShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.main}>
        <Link href="/" className={styles.back}><ArrowLeft size={14} aria-hidden="true" /> Home</Link>
        <header className={styles.hero}><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</header>
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
    <details className={styles.toc}>
      <summary>On this page <ChevronDown size={16} aria-hidden="true"/></summary>
      <nav aria-label="Table of contents">
      <ol>
        {items.map((item, i) => (
          <li key={item.id}>
            <a href={`#${item.id}`}>{i + 1}. {item.label}</a>
          </li>
        ))}
      </ol>
      </nav>
    </details>
  )
}
