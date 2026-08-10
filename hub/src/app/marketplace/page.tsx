import type { Metadata } from 'next'
import { MatrixMarketplaceClient } from '@/components/marketplace/MatrixMarketplaceClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Matrix Marketplace · SlipSurge',
  description: 'Discover and add community-built Matrices to your SlipSurge workspace.',
}

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<{ share?: string; author?: string }> }) {
  const params = await searchParams
  return <MatrixMarketplaceClient initialShareMatrixId={params.share || null} initialAuthorId={params.author || null} />
}
