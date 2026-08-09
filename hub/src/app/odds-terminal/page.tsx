import { Suspense } from 'react'
import { TierGate } from '@/components/layout/TierGate'
import { OddsTerminalClient } from '@/components/odds-terminal/OddsTerminalClient'
import { PageState } from '@/components/layout/PageState'

export const revalidate = 0

export default async function OddsTerminalPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: dateParam } = await searchParams
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  return (
    <TierGate requiredTier="ultimate" label="Odds Movement Terminal">
      <Suspense fallback={<PageState compact kind="loading" title="Loading movement data" message="Preparing the slate and sportsbook history." />}>
        <OddsTerminalClient initialDate={dateParam ?? today} />
      </Suspense>
    </TierGate>
  )
}
