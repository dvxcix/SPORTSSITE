import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PLATFORM_URL } from '@/lib/platform'
import { creatorWhop, getCreatorPaymentState } from '@/lib/creatorWhop'
import { hasCurrentCreatorAccess } from '@/lib/creatorCommerce'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { creatorDeliveryReady } from '@/lib/creatorWebhookConfig'
import { safeApiError } from '@/lib/safeApiError'
import { isTrustedWhopUrl } from '@/lib/whopUrl'

export async function POST(_request: Request, context: { params: Promise<{ productId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to purchase access.' }, { status: 401 })
  const { productId } = await context.params
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return NextResponse.json({ error: 'Offer not found.' }, { status: 404 })
  const rate = await consumeServerRateLimit(user.id, 'creator_product_checkout', 20, 3600)
  if (!rate.available || !rate.allowed) return NextResponse.json({ error: 'Please wait before reopening checkout.' }, { status: rate.available ? 429 : 503 })
  const admin = createAdminClient()
  const { data: product } = await admin.from('creator_products').select('id,creator_id,status,whop_plan_id').eq('id', productId).single()
  if (!product || product.status !== 'active' || !product.whop_plan_id) return NextResponse.json({ error: 'This offer is not available.' }, { status: 404 })
  if (product.creator_id === user.id) return NextResponse.json({ error: 'You already own this community.' }, { status: 409 })
  const { data: entitlement, error } = await admin.from('creator_entitlements').select('status,current_period_end').eq('user_id', user.id).eq('product_id', productId).maybeSingle()
  if (error) return safeApiError('creator-checkout-access', error)
  if (entitlement && hasCurrentCreatorAccess(entitlement)) return NextResponse.json({ error: 'You already have access.', accessUrl: `/creators/access/complete?product=${productId}` }, { status: 409 })
  try {
    if (!await creatorDeliveryReady(admin)) return NextResponse.json({ error: 'SlipSurge creator payments need a connection check. Please try again later.' }, { status: 503 })
    const { data: creator } = await admin.from('users').select('whop_connected_company_id').eq('id', product.creator_id).single()
    if (!creator?.whop_connected_company_id || !(await getCreatorPaymentState(creator.whop_connected_company_id)).canCharge) return NextResponse.json({ error: 'This creator cannot accept payments right now.' }, { status: 409 })
    const checkout = await creatorWhop<{ purchase_url?: string | null }>('/checkout_configurations', {
      account_id: creator.whop_connected_company_id, variant_id: product.whop_plan_id,
      redirect_url: `${PLATFORM_URL}/creators/access/complete?product=${product.id}`,
      metadata: { slipsurge_product_id: product.id, slipsurge_creator_id: product.creator_id, internal_user_id: user.id },
    }, `slipsurge-checkout-${product.id}-${user.id}-${Math.floor(Date.now() / 300_000)}`)
    if (!isTrustedWhopUrl(checkout.purchase_url)) throw new Error('Invalid checkout destination')
    return NextResponse.json({ url: checkout.purchase_url }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (cause) { return safeApiError('creator-checkout', cause, 'Checkout could not be opened. Try again.', 502) }
}
