import { FeatureGate } from '@/components/layout/FeatureGate'
import { TierGate } from '@/components/layout/TierGate'

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag="feature_blog" label="Blog">
      <TierGate requiredTier="basic" label="Blog">{children}</TierGate>
    </FeatureGate>
  )
}
