import { TierGate } from '@/components/layout/TierGate'

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return <TierGate requiredTier="basic" label="Messages">{children}</TierGate>
}
