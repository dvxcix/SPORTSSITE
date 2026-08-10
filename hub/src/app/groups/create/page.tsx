import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreateGroupForm } from '@/components/groups/CreateGroupForm'
import { hasCreatorAccess } from '@/lib/creator'

export default async function CreateGroupPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/groups/create')
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  const { data: approval } = await supabase.from('creator_applications').select('id').eq('user_id', user.id).eq('status', 'approved').maybeSingle()
  const { data: products } = hasCreatorAccess(profile?.account_type, Boolean(approval))
    ? await supabase.from('creator_products').select('id,title,price,currency').eq('creator_id', user.id).eq('status', 'active').order('created_at')
    : { data: [] }
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-black text-white mb-6">Create a Group</h1>
      <CreateGroupForm userId={user.id} products={products ?? []} />
    </div>
  )
}
