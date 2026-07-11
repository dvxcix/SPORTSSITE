import { FeatureGate } from '@/components/layout/FeatureGate'

export default function ProLayout({ children }: { children: React.ReactNode }) {
  return <FeatureGate flag="feature_pro_plan" label="SlipSurge Pro">{children}</FeatureGate>
}
