import { NextResponse } from 'next/server'
import { creatorRouteAccount } from '@/lib/creatorRouteAccount'
import { hasCurrentCreatorAccess } from '@/lib/creatorCommerce'
import { canViewMlb } from '@/lib/mlbViewerAccess'
export async function GET(request: Request, context: { params: Promise<{ productId: string }> }) {
 const account = await creatorRouteAccount(request, 'Sign in to view your access.')
 if (account.error) return account.error
 const { userId, client: supabase } = account
 const { productId } = await context.params
 if (!/^[0-9a-f-]{36}$/i.test(productId)) return NextResponse.json({ error: 'Offer not found.' }, { status: 404 })
 const { data: entitlement, error } = await supabase.from('creator_entitlements').select('status,current_period_end').eq('user_id', userId).eq('product_id', productId).maybeSingle()
 if (error) return NextResponse.json({ error: 'Access could not be checked.' }, { status: 503 })
 const active = Boolean(entitlement && hasCurrentCreatorAccess(entitlement))
 const { data: group } = active ? await supabase.from('groups').select('id,slug,name,description,sport,avatar_url,banner_url,emoji,member_count,access_type').eq('creator_product_id', productId).limit(1).maybeSingle() : { data: null }
 const visible = !account.native || group?.sport?.toUpperCase() !== 'MLB' || await canViewMlb(supabase, userId)
 return NextResponse.json({ active, status: entitlement?.status || 'pending', destination: active && group && visible ? `/groups/${group.slug}` : null,
  name: visible ? group?.name || null : null, ...(account.native ? { group: visible ? group : null } : {}) }, { headers: { 'Cache-Control': 'private, no-store' } })
}
