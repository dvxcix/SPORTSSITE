import { Suspense } from 'react'
import type { Metadata } from 'next'
import { ChartNoAxesCombined } from 'lucide-react'
import { SlateBreakdownClient } from '@/components/slate/SlateBreakdownClient'
import { TierGate } from '@/components/layout/TierGate'
import { PageState } from '@/components/layout/PageState'
import { DateLinkNavigator, ProductHero, ProductPageShell } from '@/components/product/ProductPage'

export const revalidate = 0

export const metadata: Metadata = { title: 'Slate Breakdown — SlipSurge' }

export default async function SlateBreakdownPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: dateParam } = await searchParams
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const date = dateParam ?? today

  return (
    <TierGate requiredTier="free" label="Slate Breakdown">
      <ProductPageShell>
        <ProductHero
          icon={<ChartNoAxesCombined size={23} />}
          eyebrow="Daily matchup workspace"
          title="Slate Breakdown"
          description="Move from the full slate to starter pitch mixes and batter matchup form without leaving the board."
          status={date === today ? 'Today’s slate' : 'Historical slate'}
        />
        <DateLinkNavigator date={date} today={today} basePath="/slate-breakdown" />
        <Suspense fallback={<PageState compact kind="loading" title="Loading the slate" message="Preparing starters, lineups, and matchup views." />}>
          <SlateBreakdownClient date={date} />
        </Suspense>
      </ProductPageShell>
    </TierGate>
  )
}
