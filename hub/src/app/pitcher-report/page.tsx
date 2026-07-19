import { Suspense } from 'react'
import { PitcherReportClient } from '@/components/pitcher-report/PitcherReportClient'
import { TierGate } from '@/components/layout/TierGate'

export default function PitcherReportPage() {
  return (
    <TierGate requiredTier="basic" label="Pitcher Report">
      <Suspense fallback={null}>
        <PitcherReportClient />
      </Suspense>
    </TierGate>
  )
}
