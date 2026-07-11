import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreateGroupForm } from '@/components/groups/CreateGroupForm'

export default async function CreateGroupPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/groups/create')
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-black text-white mb-6">Create a Group</h1>
      <CreateGroupForm userId={user.id} />
    </div>
  )
}
