import { TierGate } from '@/components/layout/TierGate'

export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  return <TierGate requiredTier="basic" label="Community">{children}</TierGate>
}
