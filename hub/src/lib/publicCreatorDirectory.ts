import type { MemberRingStyle } from './avatarStyles'

export type PublicCreatorProduct = { id: string; title: string; description: string | null; price: number; currency?: string | null; billing_period_days?: number | null; product_type: string }
export type PublicCreatorIdentity = {
  id: string; username: string; display_name: string | null; avatar_url: string | null; banner_url?: string | null
  avatar_ring_style?: MemberRingStyle | null; avatar_ring_color?: string | null
  bio: string | null; follower_count: number | null; is_verified?: boolean
  creator_products: PublicCreatorProduct[]
}
export type PublishedCreatorStore = {
  creator: PublicCreatorIdentity | null; creator_id: string; name: string; bio: string; logo_url: string | null; cover_url: string | null
  sports: string[]; tags: string[]; featured: boolean; featured_rank: number; access_mode: 'free' | 'paid'
}
export type CreatorDirectoryItem = PublicCreatorIdentity & {
  sports: string[]; tags: string[]; featured?: boolean; featured_rank?: number
  storefront?: Pick<PublishedCreatorStore, 'name' | 'bio' | 'logo_url' | 'cover_url' | 'access_mode'>
}

/** Callers supply the existing published-store and active-product query results. Store branding never replaces its owner. */
export function publicCreatorDirectory(legacy: PublicCreatorIdentity[], published: PublishedCreatorStore[]): CreatorDirectoryItem[] {
  const people = new Map<string, CreatorDirectoryItem>()
  for (const person of legacy) people.set(person.id, { ...person, creator_products: person.creator_products ?? [], sports: [], tags: [] })
  for (const store of published) {
    const person = store.creator
    if (!person || person.id !== store.creator_id) continue
    people.set(person.id, {
      ...person, creator_products: person.creator_products ?? people.get(person.id)?.creator_products ?? [],
      sports: store.sports ?? [], tags: store.tags ?? [], featured: store.featured, featured_rank: store.featured_rank,
      storefront: { name: store.name, bio: store.bio, logo_url: store.logo_url, cover_url: store.cover_url, access_mode: store.access_mode },
    })
  }
  return [...people.values()]
}

export function lowestCreatorMembership(creator: CreatorDirectoryItem): number | null {
  if (creator.storefront?.access_mode === 'free') return 0
  const prices = creator.creator_products.map(product => Number(product.price)).filter(price => Number.isFinite(price) && price >= 0)
  return prices.length ? Math.min(...prices) : null
}

export function findPublicCreators(creators: CreatorDirectoryItem[], query: string, sport: string, sort: string): CreatorDirectoryItem[] {
  const needle = query.trim().toLocaleLowerCase()
  const matches = creators.filter(creator => (sport === 'all' || creator.sports.includes(sport)) && (!needle || [
    creator.display_name, creator.username, creator.bio, creator.storefront?.name, creator.storefront?.bio,
    ...creator.sports, ...creator.tags, ...creator.creator_products.flatMap(product => [product.title, product.description]),
  ].some(value => value?.toLocaleLowerCase().includes(needle))))
  return matches.toSorted((a, b) => {
    if (sort === 'featured') {
      const featured = Number(Boolean(b.featured)) - Number(Boolean(a.featured))
      if (featured) return featured
      if (a.featured && b.featured) { const rank = (a.featured_rank ?? 100) - (b.featured_rank ?? 100); if (rank) return rank }
    }
    if (sort === 'price') {
      const aPrice = lowestCreatorMembership(a), bPrice = lowestCreatorMembership(b)
      if (aPrice !== bPrice) return aPrice === null ? 1 : bPrice === null ? -1 : aPrice - bPrice
    }
    if (sort === 'name') return (a.display_name || a.username).localeCompare(b.display_name || b.username)
    return (b.follower_count ?? 0) - (a.follower_count ?? 0) || (a.display_name || a.username).localeCompare(b.display_name || b.username)
  })
}
