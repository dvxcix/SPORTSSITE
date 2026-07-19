import { TierGate } from '@/components/layout/TierGate'

export default function SportsLayout({ children }: { children: React.ReactNode }) {
  return <TierGate requiredTier="basic" label="Live Scores">{children}</TierGate>
}
