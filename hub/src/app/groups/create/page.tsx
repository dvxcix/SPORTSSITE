import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreateGroupForm } from '@/components/groups/CreateGroupForm'
import { hasCreatorAccess } from '@/lib/creator'
import Link from 'next/link'
import { ArrowLeft, UsersRound } from 'lucide-react'
import { CommunityNav } from '@/components/community/CommunityNav'

export default async function CreateGroupPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/groups/create')
  const [{ data: profile }, { data: approval }] = await Promise.all([
    supabase.from('users').select('account_type').eq('id', user.id).single(),
    supabase.from('creator_applications').select('id').eq('user_id', user.id).eq('status', 'approved').maybeSingle(),
  ])
  if (!hasCreatorAccess(profile?.account_type, Boolean(approval))) redirect('/creators/apply')
  const { data: products } = await supabase.from('creator_products').select('id,title,price,currency').eq('creator_id', user.id).eq('status', 'active').order('created_at')
  return (
    <main className="ss-flow-page">
      <CommunityNav />
      <Link href="/groups" className="ss-flow-back"><ArrowLeft size={15} /> Groups</Link>
      <header className="ss-flow-heading"><span><UsersRound size={19} /></span><div><p>New community</p><h1>Create a group</h1></div></header>
      <CreateGroupForm products={products ?? []} />
    </main>
  )
}
