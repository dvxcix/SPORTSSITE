import { Suspense } from 'react'
import type { Metadata } from 'next'
import { TierGate } from '@/components/layout/TierGate'
import { PageState } from '@/components/layout/PageState'
import { ResearchHubClient } from '@/components/research/ResearchHubClient'

export const revalidate = 0

export const metadata: Metadata = {
  title: 'Research Workspace - SlipSurge',
  description: 'A unified workspace for matchup, market, and movement research.',
  robots: { index: false, follow: false },
}

export default async function ResearchPage({ searchParams }: {
  searchParams: Promise<{ date?: string; game?: string; view?: string; detail?: string }>
}) {
  const params = await searchParams
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  return (
    <TierGate requiredTier="ultimate" label="Research Workspace">
      <Suspense fallback={<PageState kind="loading" title="Loading research workspace" message="Preparing the slate and saved context." />}>
        <ResearchHubClient
          initialDate={params.date ?? today}
          initialGameKey={params.game ?? null}
          initialView={params.view}
          initialDetail={params.detail}
        />
      </Suspense>
    </TierGate>
  )
}
