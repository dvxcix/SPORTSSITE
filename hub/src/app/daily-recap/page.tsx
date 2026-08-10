import { Suspense } from 'react'
import Link from 'next/link'
import { TierGate } from '@/components/layout/TierGate'
import { DailyRecapClient } from '@/components/daily-recap/DailyRecapClient'

export const revalidate = 0

// The exact same Dugout board (DailyRecapTable in DugoutClient.tsx reuses
// buildBatterRow/Paper-MM/BatterRowEl/HrPopup directly), flattened across
// every game of the day and filtered to confirmed HR hitters only — see
// DailyRecapClient.tsx, which just fetches /api/dugout/data like the live
// board does.

export default function DailyRecapPage() {
  return (
    <TierGate requiredTier="ultimate" label="Daily Recap">
      <div className="px-2 pb-24 pt-3 sm:px-4 sm:pt-5">
        <div className="fade-in mb-4 rounded-2xl border border-lime-400/20 bg-gradient-to-r from-lime-400/[0.08] via-zinc-950 to-zinc-950 p-4 sm:p-5" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>Daily Recap</h1>
          <Link href="/dugout" style={{
            marginLeft: 'auto', padding: '7px 14px', borderRadius: 8,
            background: 'var(--surface)', border: '1px solid var(--border)',
            color: 'var(--text-2)', fontSize: 12, fontWeight: 700, textDecoration: 'none',
          }}>
            ← Dugout
          </Link>
        </div>
        <p className="mb-4 px-1 text-xs leading-5 text-zinc-400 sm:text-sm">
          The Dugout, filtered to today's confirmed home runs only — same board, same columns, same Last 1/3/5/10 toggle.
        </p>

        <Suspense fallback={null}>
          <DailyRecapClient />
        </Suspense>
      </div>
    </TierGate>
  )
}
