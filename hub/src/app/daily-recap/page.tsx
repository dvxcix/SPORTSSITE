import { Suspense } from 'react'
import { TierGate } from '@/components/layout/TierGate'
import { DailyRecapClient } from '@/components/daily-recap/DailyRecapClient'
import { CalendarRange } from 'lucide-react'
import { PageState } from '@/components/layout/PageState'
import { ProductAction, ProductHero, ProductPageShell } from '@/components/product/ProductPage'

export const revalidate = 0

// The exact same Dugout board (DailyRecapTable in DugoutClient.tsx reuses
// buildBatterRow/Paper-MM/BatterRowEl/HrPopup directly), flattened across
// every game of the day and filtered to confirmed HR hitters only — see
// DailyRecapClient.tsx, which just fetches /api/dugout/data like the live
// board does.

export default function DailyRecapPage() {
  return (
    <TierGate requiredTier="ultimate" label="Daily Recap">
      <ProductPageShell>
        <ProductHero icon={<CalendarRange size={23} />} eyebrow="Completed slate" title="Daily Recap" description="Review confirmed home runs in the same board, columns, sample windows, and historical market context used in The Dugout." status="Historical board" actions={<ProductAction href="/dugout">Open The Dugout</ProductAction>} />
        <Suspense fallback={<PageState compact kind="loading" title="Loading daily recap" message="Rebuilding the completed slate and historical market state." />}>
          <DailyRecapClient />
        </Suspense>
      </ProductPageShell>
    </TierGate>
  )
}
