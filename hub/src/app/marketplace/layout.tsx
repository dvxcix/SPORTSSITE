import { FeatureGate } from '@/components/layout/FeatureGate'
import { TierGate } from '@/components/layout/TierGate'

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag="feature_marketplace" label="Marketplace">
      <TierGate requiredTier="basic" label="Marketplace">{children}</TierGate>
    </FeatureGate>
  )
}
