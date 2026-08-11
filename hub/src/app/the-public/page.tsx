import { Suspense } from 'react'
import { FlaskConical, UsersRound } from 'lucide-react'
import { ThePublicClient } from '@/components/the-public/ThePublicClient'
import { TierGate } from '@/components/layout/TierGate'
import { PageState } from '@/components/layout/PageState'
import { DateLinkNavigator, ProductAction, ProductHero, ProductPageShell } from '@/components/product/ProductPage'

export const revalidate = 0

export default async function ThePublicPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: dateParam } = await searchParams
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const date = dateParam ?? today

  return (
    <TierGate requiredTier="advanced" label="The Public">
      <ProductPageShell>
        <ProductHero
          icon={<UsersRound size={23} />}
          eyebrow="Community market view"
          title="The Public"
          description="See where community attention is concentrated across today’s player markets."
          status="Crowd activity"
          actions={<ProductAction href="/dugout"><FlaskConical size={14} />Open The Dugout</ProductAction>}
        />
        <DateLinkNavigator date={date} today={today} basePath="/the-public" />
        <Suspense fallback={<PageState compact kind="loading" title="Loading public activity" message="Collecting picks across today’s markets." />}>
          <ThePublicClient date={date} />
        </Suspense>
      </ProductPageShell>
    </TierGate>
  )
}
