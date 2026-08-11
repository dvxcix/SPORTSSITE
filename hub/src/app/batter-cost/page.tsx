import { Suspense } from 'react'
import { ArrowLeftRight, FlaskConical } from 'lucide-react'
import { BatterCostClient } from '@/components/batter-cost/BatterCostClient'
import { TierGate } from '@/components/layout/TierGate'
import { PageState } from '@/components/layout/PageState'
import { DateLinkNavigator, ProductAction, ProductHero, ProductPageShell } from '@/components/product/ProductPage'

export const revalidate = 0

export default async function BatterCostPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: dateParam } = await searchParams
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const date = dateParam ?? today

  return (
    <TierGate requiredTier="ultimate" label="Batter Cost">
      <ProductPageShell>
        <ProductHero
          icon={<ArrowLeftRight size={23} />}
          eyebrow="Market movement"
          title="Batter Cost"
          description="Compare each batter’s opening price with the current market across the full slate."
          status="Opening vs current"
          actions={<ProductAction href="/dugout"><FlaskConical size={14} />Open The Dugout</ProductAction>}
        />
        <DateLinkNavigator date={date} today={today} basePath="/batter-cost" />
        <Suspense fallback={<PageState compact kind="loading" title="Loading batter markets" message="Preparing the opening and current prices." />}>
          <BatterCostClient date={date} />
        </Suspense>
      </ProductPageShell>
    </TierGate>
  )
}
