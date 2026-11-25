import assert from 'node:assert/strict'
import test from 'node:test'
import { nativeCreatorAnalytics } from '../src/lib/nativeCreatorAnalytics'

const now = Date.parse('2026-11-25T15:00:00Z')
const current = '2026-11-20T12:00:00Z'
const prior = '2026-10-04T12:00:00Z'
const receipt = { event_type: 'payment.succeeded', amount: 25, currency: 'usd', status: 'processed', created_at: current, product_id: 'offer-a' }
const membership = { status: 'active', current_period_end: '2026-12-01T00:00:00Z', created_at: current, updated_at: current, product_id: 'offer-a' }

test('the creator report preserves billing windows, current access and actual payment receipts', () => {
  const result = nativeCreatorAnalytics({ followers: 3, products: [{ id: 'offer-a', title: 'One' }, { id: 'offer-b', title: 'Two' }],
    members: [membership, { ...membership, created_at: prior, status: 'past_due', product_id: 'offer-b' },
      { ...membership, created_at: prior, current_period_end: '2026-11-01T00:00:00Z', status: 'expired' },
      { ...membership, status: 'trialing' }],
    receipts: [receipt, { ...receipt, amount: '30.50', created_at: prior }, { ...receipt, status: 'failed' },
      { ...receipt, amount: ' ', product_id: 'offer-b' }, { ...receipt, currency: 'EUR' }, { ...receipt, event_type: 'refund.succeeded' }],
    visits: [{ event_type: 'storefront_view', product_id: null, source: 'search', created_at: current },
      { event_type: 'offer_view', product_id: 'offer-a', source: 'search', created_at: current },
      { event_type: 'checkout_started', product_id: 'offer-a', source: 'direct', created_at: current },
      { event_type: 'offer_view', product_id: 'offer-b', source: 'direct', created_at: prior }],
    posts: [{ reaction_count: 2, comment_count: 3, repost_count: null, created_at: current },
      { reaction_count: 10, comment_count: 0, repost_count: 0, created_at: prior }],
  }, now)
  assert.equal(result.activeMembers, 2)
  assert.equal(result.trialingMembers, 1)
  assert.equal(result.atRiskMembers, 1)
  assert.equal(result.churned, 1)
  assert.equal(result.revenue, 25)
  assert.equal(result.revenueGrowth, -5.5)
  assert.equal(result.memberGrowth, 0)
  assert.equal(result.engagement, 5)
  assert.deepEqual(result.funnel, { storefrontViews: 1, offerViews: 1, checkoutStarts: 1, purchases: 1 })
  assert.deepEqual(result.sources, [{ source: 'search', count: 2 }, { source: 'direct', count: 1 }])
  assert.deepEqual(result.offers[1], { id: 'offer-b', title: 'Two', views: 0, checkouts: 0, purchases: 0, activeMembers: 0, revenue: 0 })
})
