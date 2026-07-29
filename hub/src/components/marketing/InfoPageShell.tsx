import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export function InfoPageShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px 80px', color: 'var(--text-1)' }}>
      <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 20 }}>
        <ArrowLeft size={14} /> Back to SlipSurge
      </Link>
      <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: subtitle ? 4 : 24 }}>{title}</h1>
      {subtitle && <p style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 28 }}>{subtitle}</p>}
      {children}
    </div>
  )
}

export function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} style={{ marginBottom: 24, scrollMarginTop: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>{title}</h2>
      <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-2)' }}>{children}</div>
    </div>
  )
}

// Anchor-link jump list for a long policy page — sections it links to must
// each pass the matching `id` to Section above.
export function Toc({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav
      aria-label="Table of contents"
      style={{
        marginBottom: 32, padding: '14px 16px', background: 'var(--surface-2)',
        border: '1px solid var(--border)', borderRadius: 10,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8 }}>
        On this page
      </div>
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', columns: 2, columnGap: 20 }}>
        {items.map((item, i) => (
          <li key={item.id} style={{ fontSize: 13, marginBottom: 6, breakInside: 'avoid' }}>
            <a href={`#${item.id}`} style={{ color: 'var(--text-2)', textDecoration: 'none' }}>
              {i + 1}. {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
