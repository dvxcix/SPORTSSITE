import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasCurrentCreatorAccess } from '@/lib/creatorCommerce'
export async function GET(_request: Request, context: { params: Promise<{ productId: string }> }) {
 const supabase = await createClient()
 const { data: { user } } = await supabase.auth.getUser()
 if (!user) return NextResponse.json({ error: 'Sign in to view your access.' }, { status: 401 })
 const { productId } = await context.params
 if (!/^[0-9a-f-]{36}$/i.test(productId)) return NextResponse.json({ error: 'Offer not found.' }, { status: 404 })
 const { data: entitlement, error } = await supabase.from('creator_entitlements').select('status,current_period_end').eq('user_id', user.id).eq('product_id', productId).maybeSingle()
 if (error) return NextResponse.json({ error: 'Access could not be checked.' }, { status: 503 })
 const active = Boolean(entitlement && hasCurrentCreatorAccess(entitlement))
 const { data: group } = active ? await supabase.from('groups').select('slug,name').eq('creator_product_id', productId).limit(1).maybeSingle() : { data: null }
 return NextResponse.json({ active, status: entitlement?.status || 'pending', destination: active && group ? `/groups/${group.slug}` : null, name: group?.name || null }, { headers: { 'Cache-Control': 'private, no-store' } })
}
