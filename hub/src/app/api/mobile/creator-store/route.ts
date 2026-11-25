import { NextResponse } from 'next/server'
import { CREATOR_SPORTS, CREATOR_TAGS, ownerStore, STORE_OWNER_COLUMNS } from '@/lib/creatorStorefront'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const { supabase, userId } = account
  try {
    const admin = createAdminClient()
    const [profile, store, offers, groups, mlb] = await Promise.all([
      admin.from('users').select('username,display_name,creator_commerce_status,whop_connected_company_id')
        .eq('id', userId).single(),
      admin.from('creator_storefronts').select(STORE_OWNER_COLUMNS).eq('creator_id', userId).maybeSingle(),
      supabase.from('creator_products').select('id,title,description,price,currency,status,product_type,billing_period_days,whop_plan_id')
        .eq('creator_id', userId).order('created_at', { ascending: false }).limit(100),
      supabase.from('groups').select('id,name,avatar_url,sport,access_type,creator_product_id')
        .eq('owner_id', userId).order('created_at', { ascending: true }).limit(100),
      canViewMlb(supabase, userId),
    ])
    if (!profile.data || [profile, store, offers, groups].some(result => result.error)) throw Error('Owner data unavailable')
    return respond({ store: ownerStore(store.data), storeName: profile.data.display_name ?? profile.data.username,
      paymentStatus: profile.data.creator_commerce_status, paymentConnected: Boolean(profile.data.whop_connected_company_id),
      canOnboard: profile.data.username.toLowerCase() !== 'slipsurge', sports: CREATOR_SPORTS.filter(sport => sport !== 'MLB' || mlb), tags: CREATOR_TAGS,
      offers: (offers.data ?? []).map(({ whop_plan_id, ...offer }) => ({ ...offer, providerReady: Boolean(whop_plan_id) })),
      groups: (groups.data ?? []).filter(group => mlb || group.sport?.toUpperCase() !== 'MLB') })
  } catch { return respond({ error: 'Storefront couldn’t load' }, 503) }
}
