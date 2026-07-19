import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreateStoryForm } from '@/components/social/CreateStoryForm'
import { TierGate } from '@/components/layout/TierGate'

export default async function CreateStoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/stories/create')
  return (
    <TierGate requiredTier="basic" label="Stories">
      <div className="max-w-sm mx-auto px-4 py-8">
        <h1 className="text-xl font-black text-white mb-6 text-center">Add to Story</h1>
        <CreateStoryForm userId={user.id} />
      </div>
    </TierGate>
  )
}
