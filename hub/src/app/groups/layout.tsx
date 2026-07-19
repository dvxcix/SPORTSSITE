import { TierGate } from '@/components/layout/TierGate'

export default function GroupsLayout({ children }: { children: React.ReactNode }) {
  return <TierGate requiredTier="basic" label="Groups">{children}</TierGate>
}
