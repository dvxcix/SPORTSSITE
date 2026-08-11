import { Suspense } from 'react'
import { FlaskConical, Sparkles } from 'lucide-react'
import { TierGate } from '@/components/layout/TierGate'
import { PageState } from '@/components/layout/PageState'
import { SynergyClient } from '@/components/synergy/SynergyClient'
import { ProductAction, ProductHero, ProductPageShell } from '@/components/product/ProductPage'

export const revalidate = 0

export default function SynergyPage() {
  return (
    <TierGate requiredTier="ultimate" label="Synergy">
      <ProductPageShell>
        <ProductHero
          icon={<Sparkles size={23} />}
          eyebrow="Matchup intelligence"
          title="Synergy"
          description="Rank real batter and probable-starter matchups across the slate with one consistent comparison view."
          status="Today’s matchups"
          actions={<ProductAction href="/dugout"><FlaskConical size={14} />Open The Dugout</ProductAction>}
        />
        <Suspense fallback={<PageState compact kind="loading" title="Building matchup rankings" message="Matching today’s hitters with their probable starters." />}>
          <SynergyClient />
        </Suspense>
      </ProductPageShell>
    </TierGate>
  )
}
