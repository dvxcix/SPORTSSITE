import { FeatureGate } from '@/components/layout/FeatureGate'

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return <FeatureGate flag="feature_events" label="Events">{children}</FeatureGate>
}
