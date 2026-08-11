import { Suspense } from 'react'
import { PitcherReportClient } from '@/components/pitcher-report/PitcherReportClient'
import { TierGate } from '@/components/layout/TierGate'
import { Gauge } from 'lucide-react'
import { PageState } from '@/components/layout/PageState'
import { ProductHero, ProductPageShell } from '@/components/product/ProductPage'

export default function PitcherReportPage() {
  return (
    <TierGate requiredTier="basic" label="Pitcher Report">
      <ProductPageShell>
        <ProductHero icon={<Gauge size={23} />} eyebrow="Starter intelligence" title="Pitcher Report" description="Inspect a starter’s pitch mix, recent results, and the opposing lineup’s form against those offerings." status="Probable starters" />
        <Suspense fallback={<PageState compact kind="loading" title="Loading pitcher reports" message="Preparing today’s starters and matchup data." />}>
          <PitcherReportClient />
        </Suspense>
      </ProductPageShell>
    </TierGate>
  )
}
