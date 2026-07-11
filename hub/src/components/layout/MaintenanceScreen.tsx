import Link from 'next/link'
import { Wrench } from 'lucide-react'

export function MaintenanceScreen({ label }: { label: string }) {
  return (
    <div style={{
      minHeight: '60vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16, background: 'var(--surface-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
      }}>
        <Wrench size={24} color="var(--text-3)" />
      </div>
      <h1 style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-1)', marginBottom: 6 }}>{label} is offline for now</h1>
      <p style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 320, lineHeight: 1.5, marginBottom: 20 }}>
        This section is temporarily unavailable while we work on it. Check back soon.
      </p>
      <Link href="/feed" style={{
        fontSize: 13, fontWeight: 700, color: 'var(--accent-fg)', background: 'var(--accent)',
        padding: '9px 18px', borderRadius: 10, textDecoration: 'none',
      }}>
        Back to Feed
      </Link>
    </div>
  )
}

export function AdminPreviewBanner({ label }: { label: string }) {
  return (
    <div style={{
      background: 'rgba(180,255,77,0.08)', borderBottom: '1px solid var(--border)',
      padding: '8px 16px', fontSize: 12, color: 'var(--text-2)', textAlign: 'center',
    }}>
      Admin preview — <strong>{label}</strong> is currently hidden from everyone else. Toggle it back on in Admin → Settings → Features.
    </div>
  )
}
