import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreateEventForm } from '@/components/events/CreateEventForm'

export default async function CreateEventPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/events/create')
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-black text-white mb-6">Create an Event</h1>
      <CreateEventForm userId={user.id} />
    </div>
  )
}
