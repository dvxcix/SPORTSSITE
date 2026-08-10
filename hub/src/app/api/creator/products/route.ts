import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { creatorFee, getWhopPlatform, PLATFORM_URL } from '@/lib/whopPlatform'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const admin = createAdminClient()
  const { data: profile } = await admin.from('users').select('account_type,whop_connected_company_id').eq('id', user.id).single()
  if (profile?.account_type !== 'creator' || !profile.whop_connected_company_id) return NextResponse.json({ error: 'Finish creator onboarding first' }, { status: 403 })
  const body = await request.json().catch(() => null) as { title?: string; description?: string; price?: number; productType?: 'membership' | 'one_time' } | null
  const title = body?.title?.trim(); const price = Number(body?.price); const recurring = body?.productType !== 'one_time'
  if (!title || title.length > 80 || !Number.isFinite(price) || price < 1) return NextResponse.json({ error: 'Enter a valid title and price' }, { status: 400 })
  const { data: settings } = await admin.from('platform_settings').select('value').eq('key', 'fee_independent_creator_pct').maybeSingle()
  const applicationFee = creatorFee(price, Number(settings?.value ?? 15))
  const { data: local, error } = await admin.from('creator_products').insert({ creator_id: user.id, title, description: body?.description?.trim() || null, product_type: recurring ? 'membership' : 'one_time', billing_period_days: recurring ? 30 : null, price, platform_fee_amount: applicationFee }).select('id').single()
  if (error || !local) return NextResponse.json({ error: error?.message || 'Could not create product' }, { status: 500 })
  try {
    const whop = getWhopPlatform()
    const configuration = {
      account_id: profile.whop_connected_company_id, redirect_url: `${PLATFORM_URL}/creators/access/complete?product=${local.id}`,
      metadata: { slipsurge_product_id: local.id, slipsurge_creator_id: user.id },
      plan: { initial_price: price, plan_type: recurring ? 'renewal' : 'one_time', billing_period: recurring ? 30 : undefined, renewal_price: recurring ? price : undefined, application_fee_amount: applicationFee, currency: 'usd', title, metadata: { slipsurge_product_id: local.id, slipsurge_creator_id: user.id } },
      'Idempotency-Key': `slipsurge-product-${local.id}`,
    } as unknown as Parameters<typeof whop.checkoutConfigurations.create>[0]
    const checkout = await whop.checkoutConfigurations.create(configuration)
    const localPurchaseUrl = `${PLATFORM_URL}/creators/offers/${local.id}`
    await admin.from('creator_products').update({ status: 'active', whop_checkout_configuration_id: checkout.id, whop_plan_id: checkout.plan?.id || null, purchase_url: localPurchaseUrl, updated_at: new Date().toISOString() }).eq('id', local.id)
    return NextResponse.json({ id: local.id, purchaseUrl: localPurchaseUrl })
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Whop product creation failed' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const body = await request.json().catch(() => null) as { productId?: string; status?: 'active' | 'paused' } | null
  if (!body?.productId || !['active', 'paused'].includes(body.status || '')) return NextResponse.json({ error: 'Invalid product update' }, { status: 400 })
  const admin = createAdminClient()
  const { data: product } = await admin.from('creator_products').select('id,creator_id,whop_plan_id').eq('id', body.productId).single()
  if (!product || product.creator_id !== user.id) return NextResponse.json({ error: 'Membership not found' }, { status: 404 })
  if (body.status === 'active' && !product.whop_plan_id) return NextResponse.json({ error: 'Complete Whop setup before publishing' }, { status: 409 })
  const { error } = await admin.from('creator_products').update({ status: body.status, updated_at: new Date().toISOString() }).eq('id', product.id).eq('creator_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, status: body.status })
}
