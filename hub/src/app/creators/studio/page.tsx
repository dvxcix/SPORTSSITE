import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CreatorStudioClient } from './CreatorStudioClient'

export const dynamic = 'force-dynamic'

export default async function CreatorStudioPage() {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect('/auth/login?next=/creators/studio')
  const [{ data: profile }, { data: products }, { data: groups }] = await Promise.all([
    supabase.from('users').select('id,username,display_name,account_type,whop_connected_company_id,creator_commerce_status').eq('id', user.id).single(),
    supabase.from('creator_products').select('id,title,description,price,product_type,status,purchase_url').eq('creator_id', user.id).order('created_at', { ascending: false }),
    supabase.from('groups').select('id,name,slug,emoji,access_type,creator_product_id').eq('owner_id', user.id).order('created_at', { ascending: false }),
  ])
  if (profile?.account_type !== 'creator') redirect('/creators/apply')
  return <CreatorStudioClient profile={profile} products={products || []} groups={groups || []} />
}
