import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { creatorWhop } from '@/lib/creatorWhop'
import { isTrustedWhopUrl } from '@/lib/whopUrl'
import type { CreatorMembership } from '@/lib/creatorMembership'
import { safeApiError } from '@/lib/safeApiError'
export async function POST(_request: Request, context: { params: Promise<{ productId: string }> }) {
 const supabase = await createClient()
 const { data: { user } } = await supabase.auth.getUser()
 if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
 const { productId } = await context.params
 if (!/^[0-9a-f-]{36}$/i.test(productId)) return NextResponse.json({ error: 'Membership not found.' }, { status: 404 })
 const admin = createAdminClient()
 const { data: entitlement } = await admin.from('creator_entitlements').select('whop_membership_id,product_id,creator_id').eq('user_id', user.id).eq('product_id', productId).single()
 if (!entitlement?.whop_membership_id) return NextResponse.json({ error: 'Membership not found.' }, { status: 404 })
 try {
  const membership = await creatorWhop<CreatorMembership>(`/memberships/${encodeURIComponent(entitlement.whop_membership_id)}`)
  const { data: product } = await admin.from('creator_products').select('whop_plan_id').eq('id', productId).single()
  const { data: creator } = await admin.from('users').select('whop_connected_company_id').eq('id', entitlement.creator_id).single()
  if (membership.id !== entitlement.whop_membership_id || membership.variant_id !== product?.whop_plan_id || membership.account.id !== creator?.whop_connected_company_id || !isTrustedWhopUrl(membership.manage_url)) throw new Error('Membership management unavailable')
  return NextResponse.json({ url: membership.manage_url }, { headers: { 'Cache-Control': 'private, no-store' } })
 } catch (cause) { return safeApiError('creator-member-manage', cause, 'Whop membership management could not be opened. Please try again.', 502) }
}
