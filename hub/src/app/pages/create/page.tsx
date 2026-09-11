import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreatePageForm } from '@/components/pages/CreatePageForm'
import Link from 'next/link'
import { ChevronLeft, Star } from 'lucide-react'
import { CommunityNav } from '@/components/community/CommunityNav'

export default async function CreatePagePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/pages/create')
  return (
    <main className="ss-flow-page">
      <CommunityNav />
      <Link href="/pages" className="ss-flow-back"><ChevronLeft size={14} /> Pages</Link>
      <header className="ss-flow-heading"><span><Star size={22} /></span><div><p>Public profile</p><h1>Create page</h1></div></header>
      <CreatePageForm userId={user.id} />
    </main>
  )
}
