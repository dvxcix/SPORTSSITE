import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CreatorStudioClient } from './CreatorStudioClient'
import { hasCurrentCreatorAccess } from '@/lib/creatorCommerce'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CreatorAnalytics } from './CreatorAnalyticsDashboard'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'

export const dynamic = 'force-dynamic'

function requestClock() {
  return Date.now()
}

export default async function CreatorStudioPage() {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect('/auth/login?next=/creators/studio')
  const admin = createAdminClient()
  const { data: fee, error: feeError } = await admin.from('platform_settings').select('value').eq('key', 'fee_independent_creator_pct').single()
  if (feeError || !Number.isFinite(Number(fee?.value))) throw new Error('Creator platform fee could not be loaded.')
  const now = requestClock()
  const ninetyDaysAgo = new Date(now - 90 * 86400_000).toISOString()
  const [{ data: profile }, { data: products }, { data: groups }, { data: entitlements }, { data: events }, { data: scheduledPosts }, { data: funnelEvents }, { data: creatorPosts }] = await Promise.all([
    admin.from('users').select('id,username,display_name,account_type,whop_connected_company_id,creator_commerce_status,follower_count').eq('id', user.id).single(),
    supabase.from('creator_products').select('id,title,description,price,product_type,status,purchase_url,created_at,whop_plan_id,platform_fee_amount').eq('creator_id', user.id).order('created_at', { ascending: false }),
    supabase.from('groups').select('id,name,slug,emoji,access_type,creator_product_id').eq('owner_id', user.id).order('created_at', { ascending: false }),
    supabase.from('creator_entitlements').select('id,status,created_at,updated_at,current_period_end,product_id').eq('creator_id', user.id),
    supabase.from('creator_commerce_events').select('id,event_type,amount,currency,status,created_at,product_id').eq('creator_id', user.id).order('created_at', { ascending: false }).limit(1000),
    supabase.from('creator_scheduled_posts').select('id,group_id,content,post_type,sport,visibility,scheduled_for,status,published_post_id,attempts,created_at,updated_at').eq('creator_id', user.id).in('status', ['draft', 'scheduled', 'failed']).order('scheduled_for', { ascending: true }).limit(50),
    supabase.from('creator_funnel_events').select('event_type,product_id,source,created_at').eq('creator_id', user.id).gte('created_at', ninetyDaysAgo).order('created_at', { ascending: false }).limit(5000),
    supabase.from('posts').select('id,post_type,sport,reaction_count,comment_count,repost_count,created_at').eq('author_id', user.id).gte('created_at', ninetyDaysAgo).order('created_at', { ascending: false }).limit(1000),
  ])
  if (!profile) throw new Error('Your creator workspace could not be loaded.')
  const entitlementRows = entitlements ?? []
  const commerceRows = events ?? []
  const funnelRows = funnelEvents ?? []
  const postRows = creatorPosts ?? []
  const cutoff30 = now - 30 * 86400_000
  const cutoff60 = now - 60 * 86400_000
  const inWindow = (value: string, start: number, end = now) => { const time = new Date(value).getTime(); return time >= start && time < end }
  const activeMembers = entitlementRows.filter(item => hasCurrentCreatorAccess(item)).length
  const successfulPayments = commerceRows.filter(item => item.event_type === 'payment.succeeded' && item.amount != null && Number.isFinite(Number(item.amount)) && Number(item.amount)>=0 && (item.currency || 'usd').toLowerCase()==='usd' && item.status!=='failed')
  const revenue = successfulPayments.reduce((sum, item) => sum + Number(item.amount), 0)
  const revenue30 = successfulPayments.filter(item => inWindow(item.created_at, cutoff30)).reduce((sum, item) => sum + Number(item.amount), 0)
  const revenuePrevious30 = successfulPayments.filter(item => inWindow(item.created_at, cutoff60, cutoff30)).reduce((sum, item) => sum + Number(item.amount), 0)
  const newMembers30 = entitlementRows.filter(item => inWindow(item.created_at, cutoff30)).length
  const newMembersPrevious30 = entitlementRows.filter(item => inWindow(item.created_at, cutoff60, cutoff30)).length
  const churned30 = entitlementRows.filter(item => ['canceled', 'expired', 'revoked'].includes(item.status) && inWindow(item.updated_at, cutoff30)).length
  const atRiskMembers = entitlementRows.filter(item => item.status === 'past_due').length
  const storefrontViews = funnelRows.filter(item => item.event_type === 'storefront_view' && inWindow(item.created_at, cutoff30)).length
  const offerViews = funnelRows.filter(item => item.event_type === 'offer_view' && inWindow(item.created_at, cutoff30)).length
  const checkoutStarts = funnelRows.filter(item => item.event_type === 'checkout_started' && inWindow(item.created_at, cutoff30)).length
  const purchases30 = successfulPayments.filter(item => inWindow(item.created_at, cutoff30)).length
  const sourceCounts = new Map<string, number>()
  funnelRows.filter(item => inWindow(item.created_at, cutoff30)).forEach(item => sourceCounts.set(item.source, (sourceCounts.get(item.source) ?? 0) + 1))
  const analytics: CreatorAnalytics = {
    followers: profile.follower_count ?? 0,
    activeMembers,
    trialingMembers: entitlementRows.filter(item => item.status === 'trialing').length,
    atRiskMembers,
    churned30,
    retentionRate: activeMembers + churned30 > 0 ? (activeMembers / (activeMembers + churned30)) * 100 : 0,
    newMembers30,
    memberGrowth: newMembers30 - newMembersPrevious30,
    revenue30,
    revenueGrowth: revenue30 - revenuePrevious30,
    engagement30: postRows.filter(item => inWindow(item.created_at, cutoff30)).reduce((sum, item) => sum + Number(item.reaction_count ?? 0) + Number(item.comment_count ?? 0) + Number(item.repost_count ?? 0), 0),
    posts30: postRows.filter(item => inWindow(item.created_at, cutoff30)).length,
    funnel: { storefrontViews, offerViews, checkoutStarts, purchases: purchases30 },
    sources: [...sourceCounts.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
    offers: (products ?? []).map(product => {
      const views = funnelRows.filter(item => item.product_id === product.id && item.event_type === 'offer_view' && inWindow(item.created_at, cutoff30)).length
      const checkouts = funnelRows.filter(item => item.product_id === product.id && item.event_type === 'checkout_started' && inWindow(item.created_at, cutoff30)).length
      const payments = successfulPayments.filter(item => item.product_id === product.id && inWindow(item.created_at, cutoff30))
      return {
        id: product.id,
        title: product.title,
        views,
        checkouts,
        purchases: payments.length,
        activeMembers: entitlementRows.filter(item => item.product_id === product.id && hasCurrentCreatorAccess(item)).length,
        revenue: payments.reduce((sum, item) => sum + Number(item.amount), 0),
      }
    }),
  }
  return <CreatorStudioClient profile={{ username: profile.username, account_type: profile.account_type }} feePercentage={Number(fee.value)} isTestAccount={profile.username.toLowerCase() === 'slipsurge'} products={products || []} groups={groups || []} stats={{ activeMembers, revenue, offers: products?.filter(item => item.status === 'active').length ?? 0, communities: groups?.length ?? 0 }} analytics={analytics} events={events ?? []} scheduledPosts={(scheduledPosts ?? []).filter(post => !MLB_HIBERNATING || profile.account_type === 'admin' || post.sport?.toUpperCase() !== 'MLB')} mlbAccess={!MLB_HIBERNATING || profile.account_type === 'admin'} />
}
