import { FeatureGate } from '@/components/layout/FeatureGate'

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <FeatureGate flag="feature_blog" label="Blog">{children}</FeatureGate>
}
