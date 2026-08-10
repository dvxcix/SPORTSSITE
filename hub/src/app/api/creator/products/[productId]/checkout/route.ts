import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWhopPlatform, PLATFORM_URL } from '@/lib/whopPlatform'

export async function POST(_request: Request, context: { params: Promise<{ productId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to purchase access' }, { status: 401 })
  const { productId } = await context.params
  const admin = createAdminClient()
  const { data: product } = await admin.from('creator_products').select('id,creator_id,status,whop_plan_id').eq('id', productId).single()
  if (!product || product.status !== 'active' || !product.whop_plan_id) return NextResponse.json({ error: 'This offer is not available' }, { status: 404 })
  if (product.creator_id === user.id) return NextResponse.json({ error: 'Creators already have access to their own products' }, { status: 400 })
  const checkout = await getWhopPlatform().checkoutConfigurations.create({
    plan_id: product.whop_plan_id,
    redirect_url: `${PLATFORM_URL}/groups?purchase=complete`,
    metadata: { slipsurge_product_id: product.id, slipsurge_creator_id: product.creator_id, internal_user_id: user.id },
    'Idempotency-Key': `slipsurge-checkout-${product.id}-${user.id}-${Date.now()}`,
  })
  return NextResponse.json({ url: checkout.purchase_url })
}
