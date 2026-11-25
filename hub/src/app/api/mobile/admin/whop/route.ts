import { NextResponse } from 'next/server'
import { creatorAdminAuth } from '@/lib/creatorAdminAuth'
import { recentCreatorReceipts } from '@/lib/creatorBusiness'
import { hasCurrentCreatorAccess } from '@/lib/creatorCommerce'
import { creatorPlatformHealth } from '@/lib/creatorPlatformHealth'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })

export async function GET(request: Request) {
  if (!request.headers.has('authorization')) return reply({ error: 'Sign in required' }, 401)
  const actor = await creatorAdminAuth(request)
  if ('error' in actor) return reply({ error: actor.error }, actor.status)
  const section = new URL(request.url).searchParams.get('section')
  if (section === 'connection') {
    const platform = await creatorPlatformHealth()
    return reply({ platform, memberships: {
      api: Boolean(process.env.WHOP_API_KEY), webhook: Boolean(process.env.WHOP_WEBHOOK_KEY),
      addon: Boolean(process.env.ADDON_WHOP_KEY), addonWebhook: Boolean(process.env.ADDON_WHOP_WEBHOOK),
    } })
  }
  if (section !== null) return reply({ error: 'Choose a payment section' }, 400)

  const [creators, offers, entitlements, events] = await Promise.all([
    actor.admin.from('users').select('id,username,display_name,whop_connected_company_id').in('account_type', ['creator', 'admin']).order('display_name'),
    actor.admin.from('creator_products').select('id,title,status').order('updated_at', { ascending: false }),
    actor.admin.from('creator_entitlements').select('status,current_period_end').in('status', ['active', 'trialing']),
    actor.admin.from('creator_commerce_events').select('id,creator_id,product_id,event_type,amount,currency,status,created_at')
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(100),
  ])
  if (creators.error || offers.error || entitlements.error || events.error) return reply({ error: 'Whop activity couldn’t load' }, 503)
  const accounts = (creators.data ?? []).map(row => ({ id: row.id, name: row.display_name || row.username,
    connected: Boolean(row.whop_connected_company_id) }))
  const creatorNames = new Map(accounts.map(row => [row.id, row.name]))
  const offerNames = new Map((offers.data ?? []).map(row => [row.id, row.title]))
  const history = events.data ?? []
  return reply({
    counts: { connectedCreators: accounts.filter(row => row.connected).length,
      liveOffers: (offers.data ?? []).filter(row => row.status === 'active').length,
      activeMembers: (entitlements.data ?? []).filter(member => hasCurrentCreatorAccess(member)).length,
      receipts: recentCreatorReceipts(history) },
    creators: accounts.filter(row => row.connected).map(({ id, name }) => ({ id, name })),
    events: history.map(row => ({ id: row.id, creator: creatorNames.get(row.creator_id) ?? null,
      offer: offerNames.get(row.product_id) ?? null, event: row.event_type,
      amount: row.amount != null && Number.isFinite(Number(row.amount)) ? Number(row.amount) : null,
      currency: row.currency, status: row.status, createdAt: row.created_at })),
  })
}
