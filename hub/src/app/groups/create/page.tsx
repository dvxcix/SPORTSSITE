import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function CreateGroupPage({ searchParams }: { searchParams: Promise<{ offer?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/groups/create')
  const { data: products } = await supabase.from('creator_products').select('id,title,price,currency').eq('creator_id', user.id).in('status', ['draft', 'active']).not('whop_plan_id', 'is', null).order('created_at')
  const { offer } = await searchParams
  if(offer&&products?.some(product=>product.id===offer))redirect(`/creators/studio?section=communities&offer=${encodeURIComponent(offer)}`)
  redirect('/creators/studio?setup=1')
}
