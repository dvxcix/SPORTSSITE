import { TierGate } from '@/components/layout/TierGate'
import { SprayChartsExplorer } from './SprayChartsExplorer'

export const dynamic = 'force-dynamic'

export default async function SprayChartsPage({ searchParams }: { searchParams: Promise<{ date?: string; game?: string; players?: string; result?: string; view?: string }> }) {
  const params = await searchParams
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const resultOptions = new Set(['all', 'home_run', 'near_hr', 'single', 'double', 'triple', 'out', 'other'])
  const initialResult = resultOptions.has(params.result ?? '') ? params.result as 'all' | 'home_run' | 'near_hr' | 'single' | 'double' | 'triple' | 'out' | 'other' : 'all'
  const initialPlayers = (params.players ?? '').split(',').map(Number).filter(Number.isFinite)
  return <TierGate requiredTier="ultimate" label="Spray Charts">
    <SprayChartsExplorer initialDate={params.date ?? today} initialGamePk={Number(params.game) || 0} initialPlayers={initialPlayers} initialResult={initialResult} initialView={params.view === 'heat' ? 'heat' : 'points'} />
  </TierGate>
}
