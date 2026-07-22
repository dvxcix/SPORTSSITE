import { Suspense } from 'react'
import Link from 'next/link'
import { TierGate } from '@/components/layout/TierGate'
import { SynergyClient } from '@/components/synergy/SynergyClient'

export const revalidate = 0

// Every real batter-vs-actual-starting-pitcher matchup on today's slate
// (see /api/synergy/today for the real pairing + bulk scoring), rendered
// through the exact same AffinityMatchupCards component Dugout's own
// matchup dropdown uses, just sortable across the whole day instead of
// scoped to one matchup at a time.

export default function SynergyPage() {
  return (
    <TierGate requiredTier="ultimate" label="Synergy">
      <div style={{ padding: '20px 16px' }}>
        <div className="fade-in" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>Synergy</h1>
          <Link href="/dugout" style={{
            marginLeft: 'auto', padding: '7px 14px', borderRadius: 8,
            background: 'var(--surface)', border: '1px solid var(--border)',
            color: 'var(--text-2)', fontSize: 12, fontWeight: 700, textDecoration: 'none',
          }}>
            ← Dugout
          </Link>
        </div>

        <Suspense fallback={null}>
          <SynergyClient />
        </Suspense>
      </div>
    </TierGate>
  )
}
