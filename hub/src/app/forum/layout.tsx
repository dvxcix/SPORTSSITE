import { FeatureGate } from '@/components/layout/FeatureGate'

export default function ForumLayout({ children }: { children: React.ReactNode }) {
  return <FeatureGate flag="feature_forum" label="Forum">{children}</FeatureGate>
}
