import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWhopPlatform, PLATFORM_URL } from '@/lib/whopPlatform'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { safeApiError } from '@/lib/safeApiError'
import { isTrustedWhopUrl } from '@/lib/whopUrl'

export async function POST(_request: Request, context: { params: Promise<{ productId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to purchase access' }, { status: 401 })
  const { productId } = await context.params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)) return NextResponse.json({ error: 'This offer is not available' }, { status: 404 })
  const rate = await consumeServerRateLimit(user.id, 'creator_product_checkout', 20, 60 * 60)
  if (!rate.available) return NextResponse.json({ error: 'Checkout is temporarily unavailable' }, { status: 503 })
  if (!rate.allowed) return NextResponse.json({ error: 'Checkout limit reached. Try again later.' }, { status: 429 })
  const admin = createAdminClient()
  const { data: product } = await admin.from('creator_products').select('id,creator_id,status,whop_plan_id').eq('id', productId).single()
  if (!product || product.status !== 'active' || !product.whop_plan_id) return NextResponse.json({ error: 'This offer is not available' }, { status: 404 })
  if (product.creator_id === user.id) return NextResponse.json({ error: 'Creators already have access to their own products' }, { status: 400 })
  try {
    let timeout: ReturnType<typeof setTimeout> | undefined
    const checkoutRequest = getWhopPlatform().checkoutConfigurations.create({
        plan_id: product.whop_plan_id,
        redirect_url: `${PLATFORM_URL}/groups?purchase=complete`,
        metadata: { slipsurge_product_id: product.id, slipsurge_creator_id: product.creator_id, internal_user_id: user.id },
        'Idempotency-Key': `slipsurge-checkout-${product.id}-${user.id}-${Math.floor(Date.now() / 300_000)}`,
      })
    const checkout = await Promise.race([
      checkoutRequest,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Checkout timed out')), 20_000)
      }),
    ]).finally(() => {
      if (timeout) clearTimeout(timeout)
    })
    const purchaseUrl = checkout.purchase_url
    if (!isTrustedWhopUrl(purchaseUrl)) {
      return safeApiError('creator-product-checkout-shape', null, 'Checkout is temporarily unavailable', 502)
    }
    return NextResponse.json({ url: purchaseUrl })
  } catch (error) {
    return safeApiError('creator-product-checkout', error, 'Checkout is temporarily unavailable', 502)
  }
}
