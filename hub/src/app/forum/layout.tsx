import { FeatureGate } from '@/components/layout/FeatureGate'
import { TierGate } from '@/components/layout/TierGate'

export default function ForumLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag="feature_forum" label="Forum">
      <TierGate requiredTier="basic" label="Forum">{children}</TierGate>
    </FeatureGate>
  )
}
