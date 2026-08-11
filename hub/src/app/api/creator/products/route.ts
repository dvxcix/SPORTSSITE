import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasApprovedCreatorAccess } from '@/lib/creator'
import { createAdminClient } from '@/lib/supabase/admin'
import { creatorFee, getWhopPlatform, PLATFORM_URL } from '@/lib/whopPlatform'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { safeApiError } from '@/lib/safeApiError'

function withTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Whop request timed out')), 20_000)
  })
  return Promise.race([operation, deadline]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const admin = createAdminClient()
  const { data: profile } = await admin.from('users').select('account_type,whop_connected_company_id').eq('id', user.id).single()
  if (!profile || !await hasApprovedCreatorAccess(supabase, user.id, profile.account_type) || !profile.whop_connected_company_id) return NextResponse.json({ error: 'Finish creator onboarding first' }, { status: 403 })
  const body = await request.json().catch(() => null) as { title?: string; description?: string; price?: number; productType?: 'membership' | 'one_time' } | null
  const title = body?.title?.trim(); const price = Number(body?.price); const recurring = body?.productType !== 'one_time'
  if (!title || title.length < 2 || title.length > 80 || !Number.isFinite(price) || price < 1 || price > 10_000) return NextResponse.json({ error: 'Enter a valid title and price' }, { status: 400 })
  const description = typeof body?.description === 'string' ? body.description.trim().slice(0, 1000) || null : null
  const rate = await consumeServerRateLimit(user.id, 'creator_product_create', 20, 60 * 60)
  if (!rate.available) return NextResponse.json({ error: 'Product creation is temporarily unavailable' }, { status: 503 })
  if (!rate.allowed) return NextResponse.json({ error: 'Product creation limit reached. Try again later.' }, { status: 429 })
  const { data: settings } = await admin.from('platform_settings').select('value').eq('key', 'fee_independent_creator_pct').maybeSingle()
  const applicationFee = creatorFee(price, Number(settings?.value ?? 15))
  const { data: local, error } = await admin.from('creator_products').insert({ creator_id: user.id, title, description, product_type: recurring ? 'membership' : 'one_time', billing_period_days: recurring ? 30 : null, price, platform_fee_amount: applicationFee }).select('id').single()
  if (error || !local) return safeApiError('creator-product-create', error, 'Could not create product')
  try {
    const whop = getWhopPlatform()
    const configuration = {
      account_id: profile.whop_connected_company_id, redirect_url: `${PLATFORM_URL}/creators/access/complete?product=${local.id}`,
      metadata: { slipsurge_product_id: local.id, slipsurge_creator_id: user.id },
      plan: { initial_price: price, plan_type: recurring ? 'renewal' : 'one_time', billing_period: recurring ? 30 : undefined, renewal_price: recurring ? price : undefined, application_fee_amount: applicationFee, currency: 'usd', title, metadata: { slipsurge_product_id: local.id, slipsurge_creator_id: user.id } },
      'Idempotency-Key': `slipsurge-product-${local.id}`,
    } as unknown as Parameters<typeof whop.checkoutConfigurations.create>[0]
    const checkout = await withTimeout(whop.checkoutConfigurations.create(configuration))
    const localPurchaseUrl = `${PLATFORM_URL}/creators/offers/${local.id}`
    await admin.from('creator_products').update({ status: 'active', whop_checkout_configuration_id: checkout.id, whop_plan_id: checkout.plan?.id || null, purchase_url: localPurchaseUrl, updated_at: new Date().toISOString() }).eq('id', local.id)
    return NextResponse.json({ id: local.id, purchaseUrl: localPurchaseUrl })
  } catch (cause) {
    const { error: cleanupError } = await admin.from('creator_products').delete().eq('id', local.id).eq('creator_id', user.id)
    if (cleanupError) safeApiError('creator-product-cleanup', cleanupError)
    return safeApiError('creator-product-whop', cause, 'Whop product creation failed', 502)
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const body = await request.json().catch(() => null) as { productId?: string; status?: 'active' | 'paused' } | null
  if (!body?.productId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.productId) || !['active', 'paused'].includes(body.status || '')) return NextResponse.json({ error: 'Invalid product update' }, { status: 400 })
  const admin = createAdminClient()
  const { data: product } = await admin.from('creator_products').select('id,creator_id,whop_plan_id').eq('id', body.productId).single()
  if (!product || product.creator_id !== user.id) return NextResponse.json({ error: 'Membership not found' }, { status: 404 })
  if (body.status === 'active' && !product.whop_plan_id) return NextResponse.json({ error: 'Complete Whop setup before publishing' }, { status: 409 })
  const { error } = await admin.from('creator_products').update({ status: body.status, updated_at: new Date().toISOString() }).eq('id', product.id).eq('creator_id', user.id)
  if (error) return safeApiError('creator-product-update', error, 'Could not update product')
  return NextResponse.json({ ok: true, status: body.status })
}
