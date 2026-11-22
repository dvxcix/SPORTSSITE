import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { creatorFee, PLATFORM_URL } from '@/lib/whopPlatform'
import { creatorWhop, getCreatorPaymentState } from '@/lib/creatorWhop'
import { creatorOfferPayload } from '@/lib/creatorCommerce'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { creatorDeliveryReady } from '@/lib/creatorWebhookConfig'
import { safeApiError } from '@/lib/safeApiError'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const admin = createAdminClient()
  const { data: profile } = await admin.from('users').select('username,whop_connected_company_id').eq('id', user.id).single()
  if (!profile?.whop_connected_company_id || profile.username?.toLowerCase() === 'slipsurge') return NextResponse.json({ error: 'Finish Whop setup first.' }, { status: 409 })
  const body = await request.json().catch(() => null) as { requestId?: string; title?: string; description?: string; price?: number; productType?: string } | null
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const price = Number(body?.price)
  if (!body?.requestId || !UUID.test(body.requestId) || title.length < 2 || title.length > 80 || !Number.isFinite(price) || price < 1 || price > 10_000 || !['membership', 'one_time'].includes(body.productType || '')) return NextResponse.json({ error: 'Enter an offer name, billing type and a price from $1 to $10,000.' }, { status: 400 })
  const rate = await consumeServerRateLimit(user.id, 'creator_product_create', 20, 3600)
  if (!rate.available || !rate.allowed) return NextResponse.json({ error: 'Please wait before creating another offer.' }, { status: rate.available ? 429 : 503 })
  try {
    if (!await creatorDeliveryReady(admin)) return NextResponse.json({ error: 'SlipSurge creator payments need a connection check. Please try again later.' }, { status: 503 })
    if (!(await getCreatorPaymentState(profile.whop_connected_company_id)).canCharge) return NextResponse.json({ error: 'Whop must approve payment collection before you can create a paid offer.' }, { status: 409 })
    const { data: setting, error: settingError } = await admin.from('platform_settings').select('value').eq('key', 'fee_independent_creator_pct').single()
    const percentage = Number(setting?.value)
    if (settingError || !Number.isFinite(percentage) || percentage <= 0 || percentage >= 100) throw new Error('Creator fee configuration is unavailable')
    const { data: previous, error: lookupError } = await admin.from('creator_products').select('*').eq('id', body.requestId).maybeSingle()
    if (lookupError) throw new Error('Offer lookup failed')
    if (previous && previous.creator_id !== user.id) return NextResponse.json({ error: 'Offer not found.' }, { status: 404 })
    let product = previous
    if (!product) {
      const { data: inserted, error } = await admin.from('creator_products').insert({
        id: body.requestId, creator_id: user.id, title, description: typeof body.description === 'string' ? body.description.trim().slice(0, 1000) || null : null,
        product_type: body.productType, billing_period_days: body.productType === 'membership' ? 30 : null, price: Math.round(price * 100) / 100,
        platform_fee_amount: creatorFee(price, percentage), status: 'draft',
      }).select('*').single()
      if (error?.code === '23505') return NextResponse.json({ error: 'This offer is being saved. Retry in a moment with the same form.' }, { status: 409 })
      if (error || !inserted) throw new Error('Offer could not be saved')
      product = inserted
    }
    if (!product.whop_plan_id) {
      // Keep the draft and immutable provider request after any timeout. A retry resumes the same offer.
      const checkout = await creatorWhop<{ id: string; variant?: { id: string; product_id?: string | null } | null }>('/checkout_configurations', creatorOfferPayload({
        accountId: profile.whop_connected_company_id, productId: product.id, creatorId: user.id, title: product.title, description: product.description,
        price: Number(product.price), recurring: product.product_type === 'membership', fee: Number(product.platform_fee_amount),
        returnUrl: `${PLATFORM_URL}/creators/access/complete?product=${product.id}`,
      }), `slipsurge-offer-${product.id}`)
      if (!checkout.id || !checkout.variant?.id?.startsWith('plan_')) throw new Error('Provider offer identity unavailable')
      const { error } = await admin.from('creator_products').update({
        whop_checkout_configuration_id: checkout.id, whop_plan_id: checkout.variant.id, whop_product_id: checkout.variant.product_id || null,
        purchase_url: `${PLATFORM_URL}/creators/offers/${product.id}`, updated_at: new Date().toISOString(),
      }).eq('id', product.id).eq('creator_id', user.id)
      if (error) throw new Error('Provider offer could not be linked')
    }
    return NextResponse.json({ id: product.id, status: product.status, next: `/groups/create?offer=${product.id}` })
  } catch (cause) { return safeApiError('creator-offer', cause, 'Your draft is saved. Payment setup could not finish; retry to resume this offer.', 502) }
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const body = await request.json().catch(() => null) as { productId?: string; status?: 'active' | 'paused' } | null
  if (!body?.productId || !UUID.test(body.productId) || !['active', 'paused'].includes(body.status || '')) return NextResponse.json({ error: 'Invalid offer update.' }, { status: 400 })
  const admin = createAdminClient()
  const { data: product } = await admin.from('creator_products').select('id,creator_id,whop_plan_id').eq('id', body.productId).eq('creator_id', user.id).single()
  if (!product?.whop_plan_id) return NextResponse.json({ error: 'Finish saving the offer first.' }, { status: 409 })
  const { data: profile } = await admin.from('users').select('username,whop_connected_company_id').eq('id', user.id).single()
  if (!profile?.whop_connected_company_id || profile.username?.toLowerCase() === 'slipsurge') return NextResponse.json({ error: 'Finish Whop setup first.' }, { status: 409 })
  try {
    if (body.status === 'active') {
      if (!await creatorDeliveryReady(admin)) return NextResponse.json({ error: 'Creator payment event delivery needs attention.' }, { status: 503 })
      if (!(await getCreatorPaymentState(profile.whop_connected_company_id)).canCharge) return NextResponse.json({ error: 'Whop payment collection is not ready.' }, { status: 409 })
      const { data: group, error } = await admin.from('groups').select('id').eq('creator_product_id', product.id).eq('owner_id', user.id).limit(1).maybeSingle()
      if (error || !group) return NextResponse.json({ error: 'Create the member community for this offer before publishing.' }, { status: 409 })
    } else {
      // Close the local checkout gate first, including when the provider is unavailable.
      const { error } = await admin.from('creator_products').update({ status: 'paused', updated_at: new Date().toISOString() }).eq('id', product.id).eq('creator_id', user.id)
      if (error) throw new Error('Offer could not be paused')
    }
    // Block outstanding checkout links too. Existing subscribers are not canceled.
    await creatorWhop(`/variants/${encodeURIComponent(product.whop_plan_id)}`, body.status === 'active' ? { unlimited_stock: true, visibility: 'hidden' } : { unlimited_stock: false, stock: 0, visibility: 'hidden' }, undefined, 'PATCH')
    const { error } = await admin.from('creator_products').update({ status: body.status, updated_at: new Date().toISOString() }).eq('id', product.id).eq('creator_id', user.id)
    if (error) throw new Error('Offer status could not be saved')
    return NextResponse.json({ ok: true, status: body.status })
  } catch (cause) { return safeApiError('creator-offer-publish', cause, body.status === 'paused' ? 'SlipSurge checkout is paused. Whop could not confirm closure of existing links; retry Pause.' : 'The offer was not published. Try again.', 502) }
}
