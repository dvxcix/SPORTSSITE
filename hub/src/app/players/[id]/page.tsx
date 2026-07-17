import { Suspense } from 'react'
import type { Metadata } from 'next'
import { PlayerPageClient } from '@/components/players/PlayerPageClient'

export const revalidate = 0

// Deliberately not linked from Sidebar nav yet — internal-only test page
// for the site-owned player data system (bio/season/career + Savant
// Statcast + HR log + pitch arsenal), same pattern as /allstar2026.
export const metadata: Metadata = {
  title: 'Player — SlipSurge',
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense fallback={null}>
      <PlayerPageClient mlbId={id} />
    </Suspense>
  )
}
