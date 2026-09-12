import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreateEventForm } from '@/components/events/CreateEventForm'
import Link from 'next/link'
import { CalendarPlus, ChevronLeft } from 'lucide-react'
import { CommunityNav } from '@/components/community/CommunityNav'

export default async function CreateEventPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/events/create')
  return (
    <div className="ss-flow-page">
      <CommunityNav />
      <Link href="/events" className="ss-flow-back"><ChevronLeft size={14} /> Events</Link>
      <header className="ss-flow-heading"><span><CalendarPlus size={22} /></span><div><p>Community calendar</p><h1>Create event</h1></div></header>
      <CreateEventForm userId={user.id} />
    </div>
  )
}
