import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CreatorStudioClient } from './CreatorStudioClient'
import { hasCreatorAccess } from '@/lib/creator'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export default async function CreatorStudioPage() {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect('/auth/login?next=/creators/studio')
  const admin = createAdminClient()
  const [{ data: profile }, { data: approval }, { data: products }, { data: groups }, { data: entitlements }, { data: events }] = await Promise.all([
    admin.from('users').select('id,username,display_name,account_type,whop_connected_company_id,creator_commerce_status').eq('id', user.id).single(),
    supabase.from('creator_applications').select('id').eq('user_id', user.id).eq('status', 'approved').maybeSingle(),
    supabase.from('creator_products').select('id,title,description,price,product_type,status,purchase_url,created_at').eq('creator_id', user.id).order('created_at', { ascending: false }),
    supabase.from('groups').select('id,name,slug,emoji,access_type,creator_product_id').eq('owner_id', user.id).order('created_at', { ascending: false }),
    supabase.from('creator_entitlements').select('id,status,created_at,product_id').eq('creator_id', user.id),
    supabase.from('creator_commerce_events').select('id,event_type,amount,currency,status,created_at,product_id').eq('creator_id', user.id).order('created_at', { ascending: false }).limit(50),
  ])
  if (!profile || !hasCreatorAccess(profile.account_type, Boolean(approval))) redirect('/creators/apply')
  const activeMembers = (entitlements ?? []).filter(item => ['active', 'trialing'].includes(item.status)).length
  const revenue = (events ?? []).filter(item => item.amount && !['failed', 'refunded'].includes(item.status || '')).reduce((sum, item) => sum + Number(item.amount), 0)
  return <CreatorStudioClient profile={profile} isTestAccount={profile.username.toLowerCase() === 'slipsurge'} products={products || []} groups={groups || []} stats={{ activeMembers, revenue, offers: products?.filter(item => item.status === 'active').length ?? 0, communities: groups?.length ?? 0 }} events={events ?? []} />
}
