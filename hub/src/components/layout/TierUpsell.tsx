import Link from 'next/link'
import { Lock } from 'lucide-react'
import type { Tier } from '@slipsurge/core/tiers'
import { DesktopUpgradePrompt } from '@/components/desktop/DesktopUpgradePrompt'

export function TierUpsell({ requiredTier, label }: { requiredTier: Tier; label: string }) {
  const signInOnly = requiredTier === 'free'
  return (
    <>
    {!signInOnly && <DesktopUpgradePrompt tier="Ultimate" feature={label} />}
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
        {signInOnly ? `Sign in to use ${label}` : `Unlock ${label} with Ultimate`}
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 320, lineHeight: 1.5, marginBottom: 20 }}>
        {signInOnly ? 'Create a free account or sign in to continue.' : `Get Ultimate for ${label} and the rest of the research and community tools.`}
      </p>
      <Link href={signInOnly ? '/auth/login' : '/pricing'} style={{
        fontSize: 13, fontWeight: 700, color: 'var(--accent-fg)', background: 'var(--accent)',
        padding: '9px 18px', borderRadius: 10, textDecoration: 'none',
      }}>
        {signInOnly ? 'Sign in' : 'View membership'}
      </Link>
    </div>
    </>
  )
}
