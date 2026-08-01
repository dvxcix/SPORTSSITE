import { Suspense } from 'react'
import Link from 'next/link'
import { TierGate } from '@/components/layout/TierGate'
import { DailyRecapClient } from '@/components/daily-recap/DailyRecapClient'

export const revalidate = 0

// One giant Dugout, populated with every real home run across the whole
// day instead of one game at a time — see dailyRecapPrecompute.ts for the
// data pipeline (real Statcast pitch-by-pitch source, same Statcast Last-N
// windows the live board itself reads, backfillable to any past date, and
// permanently cached once a date is in the past).

export default function DailyRecapPage() {
  return (
    <TierGate requiredTier="ultimate" label="Daily Recap">
      <div style={{ padding: '20px 16px' }}>
        <div className="fade-in" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>Daily Recap</h1>
          <Link href="/dugout" style={{
            marginLeft: 'auto', padding: '7px 14px', borderRadius: 8,
            background: 'var(--surface)', border: '1px solid var(--border)',
            color: 'var(--text-2)', fontSize: 12, fontWeight: 700, textDecoration: 'none',
          }}>
            ← Dugout
          </Link>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 18 }}>
          Every real home run from the day, one card each — same Statcast Last-N windows the live board shows, plus how it actually turned out.
        </p>

        <Suspense fallback={null}>
          <DailyRecapClient />
        </Suspense>
      </div>
    </TierGate>
  )
}
