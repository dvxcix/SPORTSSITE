import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { MatrixMarketplaceDetailClient } from '@/components/marketplace/MatrixMarketplaceDetailClient'
import type { Listing, Snapshot } from '@/components/marketplace/MatrixMarketplaceClient'
import type { Badge } from '@/lib/badges'
import { readMarketplaceSnapshot } from '@/lib/matrixMarketplace'
import { requireTier } from '@/lib/requireTier'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Matrix details · SlipSurge',
  description: 'Review a community Matrix before adding it to your SlipSurge workspace.',
}

export default async function MarketplaceListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireTier('ultimate')
  if (gate.error) {
    if (gate.error.status === 401) redirect(`/auth/login?next=${encodeURIComponent(`/marketplace/${id}`)}`)
    redirect(`/pricing?next=${encodeURIComponent(`/marketplace/${id}`)}`)
  }

  const admin = createAdminClient()
  const { data: listingRow } = await admin
    .from('matrix_marketplace_listings')
    .select('id, author_id, title, description, tags, matrix_type, color, snapshot, copy_count, published_at')
    .eq('id', id)
    .eq('status', 'published')
    .maybeSingle()

  if (!listingRow) notFound()
  const snapshot = readMarketplaceSnapshot(listingRow.snapshot)
  if (!snapshot) notFound()

  const [{ data: author }, { data: follow }, { data: badgeRows }] = await Promise.all([
    admin
      .from('users')
      .select('id, username, display_name, avatar_url, is_verified, follower_count')
      .eq('id', listingRow.author_id)
      .maybeSingle(),
    admin
      .from('follows')
      .select('following_id')
      .eq('follower_id', gate.userId!)
      .eq('following_id', listingRow.author_id)
      .maybeSingle(),
    admin
      .from('user_badges')
      .select('badge:badges(id, name, description, icon_url, card_image_url)')
      .eq('user_id', listingRow.author_id),
  ])

  const badges = (badgeRows ?? [])
    .map(row => row.badge)
    .filter(Boolean) as unknown as Badge[]
  const listing: Listing = {
    ...listingRow,
    tags: Array.isArray(listingRow.tags) ? listingRow.tags : [],
    snapshot: snapshot as Snapshot,
    matrix_type: snapshot.matrix_type,
    author,
    author_badges: badges,
    is_following: Boolean(follow),
    is_owner: listingRow.author_id === gate.userId,
  }

  return <MatrixMarketplaceDetailClient listing={listing} currentUserId={gate.userId!} />
}
