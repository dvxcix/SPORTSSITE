import { redirect } from 'next/navigation'

export default async function MarketplaceListingRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/marketplace?listing=${encodeURIComponent(id)}`)
}
