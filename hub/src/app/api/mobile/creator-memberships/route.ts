import { NextResponse } from 'next/server'
import { hasCurrentCreatorAccess } from '@/lib/creatorCommerce'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const { supabase, userId } = account
  try {
    const { data, error } = await supabase.from('creator_entitlements')
      .select('product_id,status,current_period_end').eq('user_id', userId).order('created_at', { ascending: false }).limit(100)
    if (error) throw error
    const productIds = data.map(row => row.product_id)
    if (!productIds.length) return respond({ memberships: [] })
    const admin = createAdminClient()
    const [products, hiddenGroups, mlb] = await Promise.all([
      admin.from('creator_products').select('id,title,description,price,currency,product_type,status,billing_period_days').in('id', productIds),
      admin.from('groups').select('creator_product_id').in('creator_product_id', productIds).ilike('sport', 'MLB'),
      canViewMlb(supabase, userId),
    ])
    if (products.error || hiddenGroups.error) throw Error('Membership access unavailable')
    const hidden = new Set((hiddenGroups.data ?? []).map(group => group.creator_product_id))
    const offers = new Map((products.data ?? []).map(product => [product.id, product]))
    return respond({ memberships: data.flatMap(entitlement => {
      const offer = offers.get(entitlement.product_id)
      return offer && (mlb || !hidden.has(offer.id)) ? [{ ...offer, accessStatus: entitlement.status,
        active: hasCurrentCreatorAccess(entitlement), currentPeriodEnd: entitlement.current_period_end }] : []
    }) })
  } catch { return respond({ error: 'Creator memberships couldn’t load' }, 503) }
}
