import type { Metadata } from 'next'
import { MatrixMarketplaceClient } from '@/components/marketplace/MatrixMarketplaceClient'
import { SportMatrixMarketplace } from '@/components/marketplace/SportMatrixMarketplace'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'
import styles from '@/components/marketplace/MatrixMarketplace.module.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Matrix Marketplace · SlipSurge',
  description: 'Discover and add community-built Matrices to your SlipSurge workspace.',
}

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<{ share?: string; author?: string; sport?: string }> }) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user ? await supabase.from('users').select('account_type').eq('id', user.id).maybeSingle() : { data: null }
  const canViewMlb = !MLB_HIBERNATING || profile?.account_type === 'admin'
  if (params.sport === 'mlb' && !canViewMlb) notFound()
  const sport = params.sport === 'nba' || params.sport === 'nfl' ? params.sport : canViewMlb ? 'mlb' : 'nfl'
  return <>
    <nav className={styles.sportTabs} aria-label="Matrix sport">
      {(['mlb', 'nfl', 'nba'] as const).filter(value => value !== 'mlb' || canViewMlb).map(value => <Link key={value} href={`/marketplace?sport=${value}`} aria-current={sport === value ? 'page' : undefined}>{value.toUpperCase()}</Link>)}
    </nav>
    {sport === 'mlb' ? <MatrixMarketplaceClient initialShareMatrixId={params.share || null} initialAuthorId={params.author || null} /> : <SportMatrixMarketplace key={sport} sport={sport} />}
  </>
}
