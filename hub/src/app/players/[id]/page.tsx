import { Suspense } from 'react'
import type { Metadata } from 'next'
import { PlayerPageClient } from '@/components/players/PlayerPageClient'
import { createAdminClient } from '@/lib/supabase/admin'
import { TierGate } from '@/components/layout/TierGate'
import { PageState } from '@/components/layout/PageState'
import entityStyles from '@/components/product/EntityPage.module.css'

export const revalidate = 0

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const admin = createAdminClient()
  const { data } = await admin.from('players').select('full_name').eq('mlb_id', Number(id)).maybeSingle()
  return { title: data?.full_name ? `${data.full_name} — SlipSurge` : 'Player — SlipSurge' }
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <TierGate requiredTier="basic" label="Player Pages">
      <main className={entityStyles.page}>
        <Suspense fallback={<PageState kind="loading" title="Loading player profile" message="Preparing season, Statcast, pitch, and matchup data." />}>
          <PlayerPageClient mlbId={id} />
        </Suspense>
      </main>
    </TierGate>
  )
}
