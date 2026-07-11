import { FeatureGate } from '@/components/layout/FeatureGate'

export default function PagesLayout({ children }: { children: React.ReactNode }) {
  return <FeatureGate flag="feature_pages" label="Pages">{children}</FeatureGate>
}
