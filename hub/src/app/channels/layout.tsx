import { TierGate } from '@/components/layout/TierGate'

export default function ChannelsLayout({ children }: { children: React.ReactNode }) {
  return <TierGate requiredTier="basic" label="Channels">{children}</TierGate>
}
