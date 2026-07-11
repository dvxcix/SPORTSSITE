import { FeatureGate } from '@/components/layout/FeatureGate'

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return <FeatureGate flag="feature_marketplace" label="Marketplace">{children}</FeatureGate>
}
