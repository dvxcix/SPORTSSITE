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

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>{title}</h2>
      <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-2)' }}>{children}</div>
    </div>
  )
}
