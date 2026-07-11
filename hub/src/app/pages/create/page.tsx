import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreatePageForm } from '@/components/pages/CreatePageForm'

export default async function CreatePagePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/pages/create')
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-black text-white mb-6">Create a Page</h1>
      <CreatePageForm userId={user.id} />
    </div>
  )
}
