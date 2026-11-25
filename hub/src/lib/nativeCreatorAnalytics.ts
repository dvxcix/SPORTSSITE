import { hasCurrentCreatorAccess } from '@/lib/creatorCommerce'

type Offer = { id: string; title: string }
type Member = { status: string; current_period_end: string | null; created_at: string; updated_at: string; product_id: string }
type Receipt = { event_type: string; amount: number | string | null; currency: string | null; status: string | null; created_at: string; product_id: string | null }
type Visit = { event_type: string; product_id: string | null; source: string; created_at: string }
type Post = { reaction_count: number | null; comment_count: number | null; repost_count: number | null; created_at: string }

export function nativeCreatorAnalytics(input: { followers: number; products: Offer[]; members: Member[]; receipts: Receipt[]; visits: Visit[]; posts: Post[] }, now: number) {
  const day = 86_400_000, current = now - 30 * day, previous = now - 60 * day
  function within<T extends { created_at: string }>(rows: T[], start: number, end = now) {
    return rows.filter(row => {
      const time = Date.parse(row.created_at)
      return start <= time && time < end
    })
  }
  const retained = input.members.filter(member => hasCurrentCreatorAccess(member, now))
  const churned = input.members.filter(member => ['canceled', 'expired', 'revoked'].includes(member.status) &&
    current <= Date.parse(member.updated_at) && Date.parse(member.updated_at) < now).length
  const successful = input.receipts.flatMap(receipt => {
    const amount = receipt.amount == null || typeof receipt.amount === 'string' && receipt.amount.trim() === '' ? NaN : Number(receipt.amount)
    return receipt.event_type === 'payment.succeeded' && receipt.status !== 'failed' &&
      (receipt.currency ?? 'usd').toLowerCase() === 'usd' && Number.isFinite(amount) && amount >= 0 ? [{ ...receipt, amount }] : []
  })
  const receipts = within(successful, current), priorReceipts = within(successful, previous, current)
  const sum = (rows: typeof successful) => rows.reduce((total, row) => total + row.amount, 0)
  const posts = within(input.posts, current), visits = within(input.visits, current)
  const newMembers = within(input.members, current).length
  const sources = new Map<string, number>()
  for (const visit of visits) sources.set(visit.source, (sources.get(visit.source) ?? 0) + 1)
  const visitsOf = (event: string, product?: string) => visits.filter(visit => visit.event_type === event && (product === undefined || visit.product_id === product)).length
  return {
    followers: input.followers, activeMembers: retained.length, trialingMembers: input.members.filter(member => member.status === 'trialing').length,
    atRiskMembers: input.members.filter(member => member.status === 'past_due').length, churned,
    retentionRate: retained.length + churned > 0 ? retained.length / (retained.length + churned) * 100 : 0,
    newMembers, memberGrowth: newMembers - within(input.members, previous, current).length,
    revenue: sum(receipts), revenueGrowth: sum(receipts) - sum(priorReceipts),
    engagement: posts.reduce((total, post) => total + (post.reaction_count ?? 0) + (post.comment_count ?? 0) + (post.repost_count ?? 0), 0),
    posts: posts.length,
    funnel: { storefrontViews: visitsOf('storefront_view'), offerViews: visitsOf('offer_view'), checkoutStarts: visitsOf('checkout_started'), purchases: receipts.length },
    sources: [...sources].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count || a.source.localeCompare(b.source)),
    offers: input.products.map(offer => ({ ...offer,
      views: visitsOf('offer_view', offer.id), checkouts: visitsOf('checkout_started', offer.id),
      purchases: receipts.filter(receipt => receipt.product_id === offer.id).length,
      activeMembers: retained.filter(member => member.product_id === offer.id).length,
      revenue: sum(receipts.filter(receipt => receipt.product_id === offer.id)),
    })),
  }
}
