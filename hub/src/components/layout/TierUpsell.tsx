import Link from 'next/link'
import { Lock } from 'lucide-react'
import type { Tier } from '@/lib/tiers'

const TIER_LABELS: Record<Tier, string> = { free: 'Free', basic: 'Basic', advanced: 'Advanced', ultimate: 'Ultimate' }

export function TierUpsell({ requiredTier, label }: { requiredTier: Tier; label: string }) {
  return (
    <div style={{
      minHeight: '60vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16, background: 'var(--surface-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
      }}>
        <Lock size={24} color="var(--text-3)" />
      </div>
      <h1 style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-1)', marginBottom: 6 }}>
        {label} requires {TIER_LABELS[requiredTier]}
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 320, lineHeight: 1.5, marginBottom: 20 }}>
        Upgrade your plan to unlock {label} and everything else included at the {TIER_LABELS[requiredTier]} tier.
      </p>
      <Link href="/pricing" style={{
        fontSize: 13, fontWeight: 700, color: 'var(--accent-fg)', background: 'var(--accent)',
        padding: '9px 18px', borderRadius: 10, textDecoration: 'none',
      }}>
        View Plans
      </Link>
    </div>
  )
}
