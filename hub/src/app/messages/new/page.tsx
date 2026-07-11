import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NewDMForm } from '@/components/chat/NewDMForm'

export default async function NewDMPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/messages/new')

  const { data: users } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, is_verified')
    .neq('id', user.id)
    .order('follower_count', { ascending: false })
    .limit(50)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-black text-white mb-6">New Message</h1>
      <NewDMForm users={users ?? []} />
    </div>
  )
}
