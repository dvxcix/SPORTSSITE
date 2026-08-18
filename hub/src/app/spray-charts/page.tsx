import { TierGate } from '@/components/layout/TierGate'
import { SprayChartsExplorer } from './SprayChartsExplorer'

export const dynamic = 'force-dynamic'

export default async function SprayChartsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const params = await searchParams
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  return <TierGate requiredTier="ultimate" label="Spray Charts">
    <SprayChartsExplorer initialDate={params.date ?? today} />
  </TierGate>
}
