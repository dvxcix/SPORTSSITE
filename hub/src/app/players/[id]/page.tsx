import { Suspense } from 'react'
import type { Metadata } from 'next'
import { PlayerPageClient } from '@/components/players/PlayerPageClient'
import { createAdminClient } from '@/lib/supabase/admin'

export const revalidate = 0

// Deliberately not linked from Sidebar nav yet — internal-only test page
// for the site-owned player data system (bio/season/career + Savant
// Statcast + HR log + pitch arsenal), same pattern as /allstar2026.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const admin = createAdminClient()
  const { data } = await admin.from('players').select('full_name').eq('mlb_id', Number(id)).maybeSingle()
  return { title: data?.full_name ? `${data.full_name} — SlipSurge` : 'Player — SlipSurge' }
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense fallback={null}>
      <PlayerPageClient mlbId={id} />
    </Suspense>
  )
}
