import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreateListingForm } from '@/components/marketplace/CreateListingForm'

export default async function SellPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/marketplace/sell')
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-black text-white mb-6">Create a Listing</h1>
      <CreateListingForm userId={user.id} />
    </div>
  )
}
