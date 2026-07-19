import { FeatureGate } from '@/components/layout/FeatureGate'
import { TierGate } from '@/components/layout/TierGate'

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag="feature_events" label="Events">
      <TierGate requiredTier="basic" label="Events">{children}</TierGate>
    </FeatureGate>
  )
}
